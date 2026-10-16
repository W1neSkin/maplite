import type { EntityType, SnapshotResponse } from "@cartography/project-schema"
import type { AppDatabase } from "../db/open.js"

type EntityRow = {
  entity_type: string
  entity_id: string
  version: number
  deleted: number
  payload_json: string
}

export function readSnapshot(db: AppDatabase, projectId: string, cursor: string | null, limit: number): SnapshotResponse | null {
  const project = db.prepare("SELECT schema_version FROM projects WHERE id = ?").get(projectId) as
    | { schema_version: number }
    | undefined
  if (!project) return null
  const rows = db
    .prepare(
      `SELECT entity_type, entity_id, version, deleted, payload_json
       FROM entities WHERE project_id = ? ORDER BY entity_type, entity_id`,
    )
    .all(projectId) as EntityRow[]
  const start = cursor ? rows.findIndex((row) => `${row.entity_type}/${row.entity_id}` === cursor) + 1 : 0
  const page = rows.slice(Math.max(start, 0), Math.max(start, 0) + limit)
  const last = page.at(-1)
  const hasMore = start + page.length < rows.length
  const watermark = db
    .prepare("SELECT COALESCE(MAX(change_seq), 0) AS watermark FROM entities WHERE project_id = ?")
    .get(projectId) as { watermark: number }
  return {
    entities: page.map((row) => ({
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id,
      version: row.version,
      deleted: row.deleted === 1,
      payload: JSON.parse(row.payload_json) as unknown,
    })),
    nextCursor: hasMore && last ? `${last.entity_type}/${last.entity_id}` : null,
    hasMore,
    watermark: watermark.watermark,
    schemaVersion: project.schema_version,
  }
}
