import { SCHEMA_VERSION, createId, type ProjectSummary, type ProjectSettings } from "@cartography/project-schema"
import type { AppDatabase } from "../db/open.js"
import { insertEntity } from "./entities.js"
import { issueProjectToken } from "./tokens.js"

export function listProjects(db: AppDatabase): ProjectSummary[] {
  return db
    .prepare(
      `SELECT id, name, schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt
       FROM projects ORDER BY created_at`,
    )
    .all() as ProjectSummary[]
}

export function createProject(db: AppDatabase, name: string): { project: ProjectSummary; editorToken: string } {
  const id = createId()
  const settingsId = createId()
  const now = new Date().toISOString()
  let editorToken = ""
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, name, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, name, SCHEMA_VERSION, now, now)
    const settings: ProjectSettings = {
      id: settingsId,
      projectId: id,
      name,
      defaultCrsProfileId: null,
      defaultOperationId: null,
    }
    insertEntity(db, { projectId: id, entityType: "projectSettings", entityId: settingsId, payload: settings, seq: 1 })
    editorToken = issueProjectToken(db, id, "editor")
  })
  write()
  return {
    project: { id, name, schemaVersion: SCHEMA_VERSION, createdAt: now, updatedAt: now },
    editorToken,
  }
}
