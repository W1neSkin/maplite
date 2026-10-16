import type { PushResponse, SyncOperation } from "@cartography/project-schema"

export type Sql = {
  exec(sql: string): void
  run(sql: string, params?: readonly unknown[]): void
  get<T>(sql: string, params?: readonly unknown[]): T | undefined
  all<T>(sql: string, params?: readonly unknown[]): T[]
  transaction<T>(fn: () => T): T
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_entities (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  deleted INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS outbox_operations (
  op_id TEXT PRIMARY KEY,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_state (
  project_id TEXT PRIMARY KEY,
  last_pulled_seq INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conflicts (
  op_id TEXT PRIMARY KEY,
  body_json TEXT NOT NULL
);
`

export function migrateLocal(sql: Sql): void {
  sql.exec(SCHEMA)
}

export function queueEdit(
  sql: Sql,
  entity: { entityType: string; entityId: string; version: number; deleted: boolean; payload: unknown },
  operation: SyncOperation,
): void {
  sql.transaction(() => {
    sql.run(
      `INSERT INTO local_entities (entity_type, entity_id, version, deleted, payload_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET
         version = excluded.version, deleted = excluded.deleted, payload_json = excluded.payload_json`,
      [entity.entityType, entity.entityId, entity.version, entity.deleted ? 1 : 0, JSON.stringify(entity.payload)],
    )
    sql.run(`INSERT INTO outbox_operations (op_id, body_json, created_at) VALUES (?, ?, ?)`, [
      operation.opId,
      JSON.stringify(operation),
      new Date().toISOString(),
    ])
  })
}

export function pendingOps(sql: Sql): SyncOperation[] {
  return sql
    .all<{ body_json: string }>(`SELECT body_json FROM outbox_operations ORDER BY created_at`)
    .map((row) => JSON.parse(row.body_json) as SyncOperation)
}

/**
 * Live fixes are not queued. Recorded edits are.
 * If the response is lost, the same opId is sent again and the server ignores the copy.
 */
export async function flushOutbox(sql: Sql, push: (operations: SyncOperation[]) => Promise<PushResponse>): Promise<"ok" | "offline"> {
  const operations = pendingOps(sql)
  if (operations.length === 0) return "ok"
  let response: PushResponse
  try {
    response = await push(operations)
  } catch {
    return "offline"
  }
  sql.transaction(() => {
    for (const result of response.results) {
      if (result.status === "applied" || result.status === "duplicate") {
        sql.run(`DELETE FROM outbox_operations WHERE op_id = ?`, [result.opId])
      } else if (result.status === "conflict") {
        sql.run(
          `INSERT INTO conflicts (op_id, body_json) VALUES (?, ?)
           ON CONFLICT(op_id) DO UPDATE SET body_json = excluded.body_json`,
          [result.opId, JSON.stringify(result)],
        )
        sql.run(`DELETE FROM outbox_operations WHERE op_id = ?`, [result.opId])
      }
    }
  })
  return "ok"
}
