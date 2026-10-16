import { SCHEMA_VERSION, createId, type ProjectArchive, type ProjectSummary } from "@cartography/project-schema"
import type { AppDatabase } from "../db/open.js"
import { issueProjectToken } from "./tokens.js"

type EntityRow = {
  entity_type: ProjectArchive["entities"][number]["entityType"]
  entity_id: string
  version: number
  deleted: number
  payload_json: string
  change_seq: number
}

function rewrite(payload: unknown, projectId: string): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload
  const copy = { ...(payload as Record<string, unknown>) }
  if ("projectId" in copy) copy.projectId = projectId
  return copy
}

export function exportArchive(db: AppDatabase, projectId: string): ProjectArchive | null {
  const project = db.prepare("SELECT name, schema_version FROM projects WHERE id = ?").get(projectId) as
    | { name: string; schema_version: number }
    | undefined
  if (!project) return null
  const rows = db
    .prepare(
      `SELECT entity_type, entity_id, version, deleted, payload_json, change_seq
       FROM entities WHERE project_id = ? ORDER BY change_seq`,
    )
    .all(projectId) as EntityRow[]
  return {
    format: "cartography-archive",
    version: 1,
    project: { name: project.name, schemaVersion: project.schema_version },
    entities: rows.map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      version: row.version,
      deleted: row.deleted === 1,
      payload: JSON.parse(row.payload_json) as unknown,
    })),
  }
}

export function importArchive(db: AppDatabase, archive: ProjectArchive, name?: string): { project: ProjectSummary; editorToken: string } | "invalid" {
  if (archive.format !== "cartography-archive" || archive.version !== 1 || !archive.project?.name) return "invalid"
  if (!Array.isArray(archive.entities)) return "invalid"
  const id = createId()
  const now = new Date().toISOString()
  const projectName = name?.trim() || archive.project.name
  let editorToken = ""
  const write = db.transaction(() => {
    db.prepare(`INSERT INTO projects (id, name, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
      id,
      projectName,
      SCHEMA_VERSION,
      now,
      now,
    )
    archive.entities.forEach((entity, index) => {
      const seq = index + 1
      const payload = rewrite(entity.payload, id)
      const json = JSON.stringify(payload)
      const deleted = entity.deleted ? 1 : 0
      db.prepare(
        `INSERT INTO entities (project_id, entity_type, entity_id, version, payload_json, deleted, change_seq)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, entity.entityType, entity.entityId, entity.version, json, deleted, seq)
      db.prepare(
        `INSERT INTO project_changes (project_id, seq, entity_type, entity_id, version, deleted, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, seq, entity.entityType, entity.entityId, entity.version, deleted, json)
    })
    editorToken = issueProjectToken(db, id, "editor")
  })
  write()
  return {
    project: { id, name: projectName, schemaVersion: SCHEMA_VERSION, createdAt: now, updatedAt: now },
    editorToken,
  }
}

export function duplicateProject(db: AppDatabase, projectId: string): { project: ProjectSummary; editorToken: string } | null {
  const archive = exportArchive(db, projectId)
  if (!archive) return null
  const copied = importArchive(db, archive, `Copy of ${archive.project.name}`)
  return copied === "invalid" ? null : copied
}

export function deleteProject(db: AppDatabase, projectId: string): boolean {
  const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)
  if (!project) return false
  const run = db.transaction(() => {
    const sessions = db.prepare("SELECT id FROM track_sessions WHERE project_id = ?").all(projectId) as { id: string }[]
    for (const session of sessions) db.prepare("DELETE FROM track_points WHERE session_id = ?").run(session.id)
    db.prepare("DELETE FROM track_sessions WHERE project_id = ?").run(projectId)
    db.prepare("DELETE FROM live_positions WHERE project_id = ?").run(projectId)
    db.prepare("DELETE FROM live_objects WHERE project_id = ?").run(projectId)
    const devices = db.prepare("SELECT id FROM devices WHERE project_id = ?").all(projectId) as { id: string }[]
    for (const device of devices) {
      db.prepare("DELETE FROM device_push_tokens WHERE device_id = ?").run(device.id)
      db.prepare("DELETE FROM device_commands WHERE device_id = ?").run(device.id)
    }
    db.prepare("DELETE FROM devices WHERE project_id = ?").run(projectId)
    db.prepare("DELETE FROM accepted_operations WHERE project_id = ?").run(projectId)
    db.prepare("DELETE FROM project_changes WHERE project_id = ?").run(projectId)
    db.prepare("DELETE FROM entities WHERE project_id = ?").run(projectId)
    db.prepare("DELETE FROM enrollment_codes WHERE project_id = ?").run(projectId)
    db.prepare("DELETE FROM project_tokens WHERE project_id = ?").run(projectId)
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId)
  })
  run()
  return true
}
