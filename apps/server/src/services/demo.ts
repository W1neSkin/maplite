import { SCHEMA_VERSION } from "@cartography/project-schema"
import type { AppDatabase } from "../db/open.js"
import { insertEntity } from "./entities.js"
import { DEMO_PROJECT_ID, buildDemoRecords } from "./demo-data.js"

export { DEMO_PROJECT_ID } from "./demo-data.js"

/** Inserts the sample project once. A second call leaves the rows alone. */
export function seedDemo(db: AppDatabase): { projectId: string; created: boolean } {
  const existing = db.prepare("SELECT id FROM projects WHERE id = ?").get(DEMO_PROJECT_ID)
  if (existing) return { projectId: DEMO_PROJECT_ID, created: false }
  const now = new Date().toISOString()
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, name, schema_version, created_at, updated_at)
       VALUES (?, 'Demo', ?, ?, ?)`,
    ).run(DEMO_PROJECT_ID, SCHEMA_VERSION, now, now)
    buildDemoRecords().forEach((record, index) => {
      insertEntity(db, {
        projectId: DEMO_PROJECT_ID,
        entityType: record.entityType,
        entityId: record.entityId,
        payload: record.payload,
        seq: index + 1,
      })
    })
  })
  write()
  return { projectId: DEMO_PROJECT_ID, created: true }
}
