import type { AppDatabase } from "../db/open.js"

export function insertEntity(
  db: AppDatabase,
  input: { projectId: string; entityType: string; entityId: string; payload: unknown; seq: number },
): void {
  const json = JSON.stringify(input.payload)
  db.prepare(
    `INSERT INTO entities (project_id, entity_type, entity_id, version, payload_json, deleted, change_seq)
     VALUES (?, ?, ?, 1, ?, 0, ?)`,
  ).run(input.projectId, input.entityType, input.entityId, json, input.seq)
  db.prepare(
    `INSERT INTO project_changes (project_id, seq, entity_type, entity_id, version, deleted, payload_json)
     VALUES (?, ?, ?, ?, 1, 0, ?)`,
  ).run(input.projectId, input.seq, input.entityType, input.entityId, json)
}
