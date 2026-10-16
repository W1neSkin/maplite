import type { AppDatabase } from "../db/open.js"
import { notifyProject } from "../events.js"

export type LiveEnvelope = {
  type: string
  id: string
  fixId: string
  sampledAt: string
  deviceId: string | null
  body: Record<string, unknown>
}

export type StoredLive = LiveEnvelope & { receivedAt: string }

const TYPE_RE = /^[a-z0-9-]{1,32}$/

function rowId(projectId: string, type: string, id: string): string {
  return `${projectId}:${type}:${id}`
}

function readOne(db: AppDatabase, projectId: string, type: string, id: string): StoredLive | null {
  const row = db.prepare("SELECT payload_json FROM live_objects WHERE id = ? AND project_id = ?").get(rowId(projectId, type, id), projectId) as
    | { payload_json: string }
    | undefined
  if (!row) return null
  return JSON.parse(row.payload_json) as StoredLive
}

/**
 * One row per type and id. An older sampledAt is a late packet and must not
 * move the point backwards. The same fixId is a retry, so it does not refresh
 * freshness. A standing phone repeats a newer sampledAt on a heartbeat.
 */
export function publishLive(db: AppDatabase, projectId: string, input: LiveEnvelope, boundDeviceId: string | null): "ok" | "stale" | "forbidden" | "invalid" {
  if (!TYPE_RE.test(input.type) || input.id.length === 0 || input.id.length > 80 || input.fixId.length === 0) return "invalid"
  if (boundDeviceId && input.id !== boundDeviceId) return "forbidden"
  const key = rowId(projectId, input.type, input.id)
  if (input.body.sharing === false) {
    db.prepare("DELETE FROM live_objects WHERE id = ?").run(key)
    notifyProject(projectId, "positions-available", Date.now())
    return "ok"
  }
  if (!Number.isFinite(Date.parse(input.sampledAt))) return "invalid"
  if (input.type === "device") {
    const longitude = input.body.longitude
    const latitude = input.body.latitude
    if (typeof longitude !== "number" || typeof latitude !== "number") return "invalid"
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return "invalid"
  }
  const existing = readOne(db, projectId, input.type, input.id)
  if (existing?.fixId === input.fixId) return "ok"
  if (existing && existing.sampledAt > input.sampledAt) return "stale"
  const stored: StoredLive = {
    ...input,
    deviceId: input.deviceId ?? input.id,
    receivedAt: new Date().toISOString(),
  }
  const json = JSON.stringify(stored)
  if (json.length > 4000) return "invalid"
  db.prepare(
    `INSERT INTO live_objects (id, project_id, payload_json) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, payload_json = excluded.payload_json`,
  ).run(key, projectId, json)
  notifyProject(projectId, "positions-available", Date.now())
  return "ok"
}

export function listLive(db: AppDatabase, projectId: string): StoredLive[] {
  const rows = db.prepare("SELECT payload_json FROM live_objects WHERE project_id = ?").all(projectId) as { payload_json: string }[]
  return rows.map((row) => JSON.parse(row.payload_json) as StoredLive)
}
