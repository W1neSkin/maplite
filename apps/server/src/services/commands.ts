import { createId } from "@cartography/project-schema"
import type { AppDatabase } from "../db/open.js"

const MODES = new Set(["off", "live", "track", "both"])
const TEN_MINUTES_MS = 10 * 60 * 1000

export type CommandMode = "off" | "live" | "track" | "both"

export type DeviceCommand = {
  id: string
  mode: CommandMode
  expiresAt: string
  ackedAt: string | null
  result: string | null
}

/**
 * The operator asks. The phone confirms later.
 * Push is not used: the phone reads this on its next contact.
 */
export function issueCommand(db: AppDatabase, projectId: string, deviceId: string, mode: string): DeviceCommand | null {
  if (!MODES.has(mode)) return null
  const device = db.prepare("SELECT id FROM devices WHERE id = ? AND project_id = ?").get(deviceId, projectId)
  if (!device) return null
  const id = createId()
  const issuedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + TEN_MINUTES_MS).toISOString()
  const body = JSON.stringify({ mode })
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO device_commands (id, project_id, device_id, body_json, issued_at, expires_at, acked_at, result)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
    ).run(id, projectId, deviceId, body, issuedAt, expiresAt)
    db.prepare("UPDATE devices SET desired_state = ? WHERE id = ?").run(mode, deviceId)
  })
  run()
  return { id, mode: mode as CommandMode, expiresAt, ackedAt: null, result: null }
}

export type SelfCommand = {
  desired: string
  controlled: boolean
  command: DeviceCommand | null
}

/** Touch last_seen. An expired or already confirmed command is not returned. */
export function readSelfCommand(db: AppDatabase, projectId: string, deviceId: string, now = new Date().toISOString()): SelfCommand | null {
  const device = db.prepare("SELECT desired_state FROM devices WHERE id = ? AND project_id = ?").get(deviceId, projectId) as { desired_state: string } | undefined
  if (!device) return null
  db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(now, deviceId)
  const controlled = db.prepare("SELECT id FROM device_commands WHERE device_id = ? LIMIT 1").get(deviceId) != null
  const row = db
    .prepare(
      `SELECT id, body_json, expires_at, acked_at, result
       FROM device_commands WHERE device_id = ? ORDER BY issued_at DESC LIMIT 1`,
    )
    .get(deviceId) as { id: string; body_json: string; expires_at: string; acked_at: string | null; result: string | null } | undefined
  const open = row && !row.acked_at && row.expires_at > now ? row : undefined
  const mode = open ? modeOf(open.body_json) : null
  return {
    desired: device.desired_state,
    controlled,
    command: open && mode ? { id: open.id, mode, expiresAt: open.expires_at, ackedAt: null, result: null } : null,
  }
}

/**
 * Confirm a command, or adopt the phone's own switch.
 * A second confirmation does not change the row.
 */
export function ackCommand(
  db: AppDatabase,
  projectId: string,
  deviceId: string,
  input: { commandId?: string | null; actual: string; result?: string | null; adopt?: boolean },
  now = new Date().toISOString(),
): boolean {
  const device = db.prepare("SELECT id FROM devices WHERE id = ? AND project_id = ?").get(deviceId, projectId)
  if (!device) return false
  const actual = input.actual
  const result = input.result ?? actual
  const run = db.transaction(() => {
    if (input.adopt && MODES.has(actual)) {
      db.prepare("UPDATE devices SET desired_state = ?, actual_state = ?, last_seen_at = ? WHERE id = ?").run(actual, actual, now, deviceId)
    } else {
      db.prepare("UPDATE devices SET actual_state = ?, last_seen_at = ? WHERE id = ?").run(actual, now, deviceId)
    }
    if (!input.commandId) return
    db.prepare(
      `UPDATE device_commands SET acked_at = ?, result = ?
       WHERE id = ? AND device_id = ? AND project_id = ? AND acked_at IS NULL`,
    ).run(now, result, input.commandId, deviceId, projectId)
  })
  run()
  return true
}

function modeOf(body: string): CommandMode | null {
  try {
    const parsed = JSON.parse(body) as { mode?: unknown }
    return typeof parsed.mode === "string" && MODES.has(parsed.mode) ? (parsed.mode as CommandMode) : null
  } catch {
    return null
  }
}

export function latestCommand(db: AppDatabase, deviceId: string): DeviceCommand | null {
  const row = db
    .prepare(
      `SELECT id, body_json, expires_at, acked_at, result
       FROM device_commands WHERE device_id = ? ORDER BY issued_at DESC LIMIT 1`,
    )
    .get(deviceId) as { id: string; body_json: string; expires_at: string; acked_at: string | null; result: string | null } | undefined
  if (!row) return null
  const mode = modeOf(row.body_json)
  if (!mode) return null
  return { id: row.id, mode, expiresAt: row.expires_at, ackedAt: row.acked_at, result: row.result }
}
