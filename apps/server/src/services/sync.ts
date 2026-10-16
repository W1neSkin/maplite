import {
  ENTITY_TYPES,
  SCHEMA_VERSION,
  type ChangesResponse,
  type EditOrigin,
  type EntityType,
  type OperationResult,
  type PushRequest,
  type PushResponse,
  type SyncOperation,
} from "@cartography/project-schema"
import type { AppDatabase } from "../db/open.js"
import { notifyProject } from "../events.js"

type EntityRow = { version: number; deleted: number; payload_json: string; change_seq: number }

class BatchRejected {
  constructor(readonly results: OperationResult[]) {}
}

function watermarkOf(db: AppDatabase, projectId: string): number {
  const row = db.prepare("SELECT COALESCE(MAX(seq), 0) AS watermark FROM project_changes WHERE project_id = ?").get(projectId) as {
    watermark: number
  }
  return row.watermark
}

function readEntity(db: AppDatabase, projectId: string, entityType: string, entityId: string): EntityRow | undefined {
  return db
    .prepare(
      `SELECT version, deleted, payload_json, change_seq FROM entities
       WHERE project_id = ? AND entity_type = ? AND entity_id = ?`,
    )
    .get(projectId, entityType, entityId) as EntityRow | undefined
}

function remember(db: AppDatabase, op: SyncOperation, result: OperationResult): OperationResult {
  db.prepare(
    `INSERT INTO accepted_operations (project_id, op_id, client_id, result_json) VALUES (?, ?, ?, ?)`,
  ).run(op.projectId, op.opId, op.clientId, JSON.stringify(result))
  return result
}

function storedResult(db: AppDatabase, projectId: string, opId: string): OperationResult | undefined {
  const row = db.prepare("SELECT result_json FROM accepted_operations WHERE project_id = ? AND op_id = ?").get(projectId, opId) as
    | { result_json: string }
    | undefined
  if (!row) return undefined
  const saved = JSON.parse(row.result_json) as OperationResult
  if (saved.status === "applied") return { ...saved, status: "duplicate" }
  return saved
}

function nextSeq(db: AppDatabase, projectId: string): number {
  return watermarkOf(db, projectId) + 1
}

function writeEntity(
  db: AppDatabase,
  input: { projectId: string; entityType: string; entityId: string; version: number; deleted: boolean; payload: unknown; seq: number },
): void {
  const json = JSON.stringify(input.payload ?? null)
  const deleted = input.deleted ? 1 : 0
  db.prepare(
    `INSERT INTO entities (project_id, entity_type, entity_id, version, payload_json, deleted, change_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, entity_type, entity_id) DO UPDATE SET
       version = excluded.version,
       payload_json = excluded.payload_json,
       deleted = excluded.deleted,
       change_seq = excluded.change_seq`,
  ).run(input.projectId, input.entityType, input.entityId, input.version, json, deleted, input.seq)
  db.prepare(
    `INSERT INTO project_changes (project_id, seq, entity_type, entity_id, version, deleted, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.projectId, input.seq, input.entityType, input.entityId, input.version, deleted, json)
}

function conflict(row: EntityRow): OperationResult {
  return {
    opId: "",
    status: "conflict",
    serverVersion: row.version,
    serverPayload: JSON.parse(row.payload_json) as unknown,
    serverDeleted: row.deleted === 1,
  }
}

function tombstoneFeatures(db: AppDatabase, projectId: string, layerId: string): void {
  const rows = db
    .prepare(
      `SELECT entity_id, version, payload_json, deleted FROM entities
       WHERE project_id = ? AND entity_type = 'feature' AND deleted = 0`,
    )
    .all(projectId) as { entity_id: string; version: number; payload_json: string; deleted: number }[]
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json) as { layerId?: string }
    if (payload.layerId !== layerId) continue
    const seq = nextSeq(db, projectId)
    writeEntity(db, {
      projectId,
      entityType: "feature",
      entityId: row.entity_id,
      version: row.version + 1,
      deleted: true,
      payload: JSON.parse(row.payload_json) as unknown,
      seq,
    })
  }
}

/** Keep the writer on the stored record. createdBy stays with whoever first wrote it. */
function stampPayload(op: SyncOperation, previousPayload: unknown): unknown {
  const origin = op.origin
  const source = op.kind === "delete" ? previousPayload : op.payload
  if (!origin || !source || typeof source !== "object") return source
  const previous = previousPayload && typeof previousPayload === "object" ? (previousPayload as { createdBy?: EditOrigin }) : {}
  const next: Record<string, unknown> = { ...(source as Record<string, unknown>) }
  if (op.kind === "create") next.createdBy = origin
  else if (previous.createdBy) next.createdBy = previous.createdBy
  if (op.kind === "delete") next.deletedBy = origin
  else next.updatedBy = origin
  return next
}

function reject(op: SyncOperation, code: string, message: string): OperationResult {
  return { opId: op.opId, status: "rejected", code, message }
}

function geometryMatches(db: AppDatabase, op: SyncOperation): OperationResult | null {
  if (op.entityType !== "feature" || op.kind === "delete") return null
  const payload = op.payload as { layerId?: string; geometry?: { type?: string } } | null
  if (!payload?.layerId || !payload.geometry?.type) return reject(op, "validation", "Feature geometry is required")
  const layer = readEntity(db, op.projectId, "layer", payload.layerId)
  if (!layer || layer.deleted === 1) return reject(op, "validation", "Feature layer is missing")
  const layerPayload = JSON.parse(layer.payload_json) as { geometryType?: string }
  if (layerPayload.geometryType !== payload.geometry.type) {
    return reject(op, "geometry_mismatch", "A layer can hold only one geometry type")
  }
  return null
}

function applyOne(db: AppDatabase, op: SyncOperation): OperationResult {
  const previous = storedResult(db, op.projectId, op.opId)
  if (previous) return { ...previous, opId: op.opId }
  if (!ENTITY_TYPES.includes(op.entityType)) return reject(op, "validation", "Unknown entity type")
  if (op.kind !== "delete" && (op.payload === undefined || op.payload === null)) {
    return reject(op, "validation", "Operation payload is required")
  }
  const geometryError = geometryMatches(db, op)
  if (geometryError) return remember(db, op, geometryError)
  const row = readEntity(db, op.projectId, op.entityType, op.entityId)
  if (op.kind === "create") {
    if (row) return remember(db, op, { ...conflict(row), opId: op.opId })
    const seq = nextSeq(db, op.projectId)
    writeEntity(db, { projectId: op.projectId, entityType: op.entityType, entityId: op.entityId, version: 1, deleted: false, payload: stampPayload(op, null), seq })
    return remember(db, op, { opId: op.opId, status: "applied", version: 1, changeSeq: seq })
  }
  if (!row) return remember(db, op, reject(op, "not_found", "Record was not found"))
  // A tombstone stays a tombstone. A repeated delete of that version is a no-op.
  if (row.deleted === 1) {
    if (op.kind === "delete" && op.baseVersion === row.version) {
      return remember(db, op, { opId: op.opId, status: "applied", version: row.version, changeSeq: row.change_seq })
    }
    return remember(db, op, { ...conflict(row), opId: op.opId })
  }
  if (row.version !== op.baseVersion) return remember(db, op, { ...conflict(row), opId: op.opId })
  const seq = nextSeq(db, op.projectId)
  const deleted = op.kind === "delete"
  const previousPayload = JSON.parse(row.payload_json) as unknown
  writeEntity(db, {
    projectId: op.projectId,
    entityType: op.entityType,
    entityId: op.entityId,
    version: row.version + 1,
    deleted,
    payload: stampPayload(op, previousPayload),
    seq,
  })
  if (deleted && op.entityType === "layer") tombstoneFeatures(db, op.projectId, op.entityId)
  return remember(db, op, { opId: op.opId, status: "applied", version: row.version + 1, changeSeq: seq })
}

/**
 * Project order comes from change_seq, not from device clocks.
 * A repeated opId returns the first result and does not write again.
 */
export function pushOperations(db: AppDatabase, projectId: string, request: PushRequest): PushResponse | "schema" | null {
  const project = db.prepare("SELECT schema_version FROM projects WHERE id = ?").get(projectId) as { schema_version: number } | undefined
  if (!project) return null
  if (request.schemaVersion !== undefined && request.schemaVersion !== SCHEMA_VERSION) return "schema"
  const run = db.transaction(() => {
    const results: OperationResult[] = []
    for (const op of request.operations) {
      if (op.projectId !== projectId) {
        results.push(reject(op, "validation", "Operation is for another project"))
        continue
      }
      results.push(applyOne(db, op))
    }
    const failed = results.some((result) => result.status !== "applied" && result.status !== "duplicate")
    if (request.atomic && failed) throw new BatchRejected(results)
    return results
  })
  let results: OperationResult[]
  try {
    results = run()
  } catch (error) {
    if (error instanceof BatchRejected) results = error.results
    else throw error
  }
  const watermark = watermarkOf(db, projectId)
  if (results.some((result) => result.status === "applied")) {
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), projectId)
    notifyProject(projectId, "changes-available", watermark)
  }
  return { results, watermark, schemaVersion: project.schema_version }
}

export function readChanges(db: AppDatabase, projectId: string, after: number, limit: number): ChangesResponse | null {
  const project = db.prepare("SELECT schema_version FROM projects WHERE id = ?").get(projectId) as { schema_version: number } | undefined
  if (!project) return null
  const rows = db
    .prepare(
      `SELECT seq, entity_type, entity_id, version, deleted, payload_json
       FROM project_changes WHERE project_id = ? AND seq > ? ORDER BY seq LIMIT ?`,
    )
    .all(projectId, after, limit + 1) as {
    seq: number
    entity_type: EntityType
    entity_id: string
    version: number
    deleted: number
    payload_json: string
  }[]
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return {
    changes: page.map((row) => ({
      seq: row.seq,
      entityType: row.entity_type,
      entityId: row.entity_id,
      version: row.version,
      deleted: row.deleted === 1,
      payload: JSON.parse(row.payload_json) as unknown,
    })),
    nextCursor: last?.seq ?? after,
    hasMore: rows.length > limit,
    watermark: watermarkOf(db, projectId),
    schemaVersion: project.schema_version,
  }
}
