import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { AppDatabase } from "./open.js"

function migrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
}

export function migrate(db: AppDatabase, dir: string): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map((row) => row.id),
  )
  const ran: string[] = []
  for (const file of migrationFiles(dir)) {
    const id = file.replace(/\.sql$/, "")
    if (applied.has(id)) continue
    const sql = readFileSync(resolve(dir, file), "utf8")
    db.transaction(() => {
      db.exec(sql)
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(id, new Date().toISOString())
    })()
    ran.push(id)
  }
  return ran
}

export function latestMigrationId(dir: string): string {
  const files = migrationFiles(dir)
  return files.at(-1)?.replace(/\.sql$/, "") ?? ""
}

/** True when the newest migration is applied and the file accepts a write. */
export function databaseReady(db: AppDatabase, dir: string): boolean {
  const latest = latestMigrationId(dir)
  if (!latest) return false
  const row = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(latest)
  if (!row) return false
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare("SELECT 1").get()
  } finally {
    db.exec("ROLLBACK")
  }
  return true
}
