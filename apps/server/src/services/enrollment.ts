import { createId } from "@cartography/project-schema"
import { randomBytes } from "node:crypto"
import { hashSecret } from "../auth/tokens.js"
import type { AppDatabase } from "../db/open.js"
import { issueProjectToken } from "./tokens.js"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const MAX_ATTEMPTS = 5
const TEN_MINUTES_MS = 10 * 60 * 1000

/** 16 random bytes is 128 bits. Grouping is only for reading the code aloud. */
function newCode(): string {
  const bytes = randomBytes(16)
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += ALPHABET[(value >> bits) & 31]
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function normalizeCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, "").toUpperCase()
}

export function groupCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code
}

export function createEnrollment(db: AppDatabase, projectId: string, serverUrl: string): { code: string; expiresAt: string; qrText: string } {
  const code = newCode()
  const expiresAt = new Date(Date.now() + TEN_MINUTES_MS).toISOString()
  db.prepare(
    `INSERT INTO enrollment_codes (id, project_id, hash, expires_at, attempts, redeemed_at)
     VALUES (?, ?, ?, ?, 0, NULL)`,
  ).run(createId(), projectId, hashSecret(code), expiresAt)
  return {
    code: groupCode(code),
    expiresAt,
    qrText: JSON.stringify({ serverUrl, code }),
  }
}

export type RedeemInput = {
  code: string
  deviceId: string
  platform: string
  displayName: string
  appVersion: string
}

/** The code can be spent once. A second call, even with the same code, fails. */
export function redeemEnrollment(db: AppDatabase, input: RedeemInput): { projectId: string; token: string; deviceId: string } | null {
  const hash = hashSecret(normalizeCode(input.code))
  const now = new Date().toISOString()
  let issued: { projectId: string; token: string; deviceId: string } | null = null
  const run = db.transaction(() => {
    const claimed = db
      .prepare(
        `UPDATE enrollment_codes
         SET redeemed_at = ?, attempts = attempts + 1
         WHERE hash = ? AND redeemed_at IS NULL AND expires_at > ? AND attempts < ?`,
      )
      .run(now, hash, now, MAX_ATTEMPTS)
    if (claimed.changes !== 1) {
      db.prepare(
        `UPDATE enrollment_codes SET attempts = attempts + 1
         WHERE hash = ? AND NOT (redeemed_at IS NULL AND expires_at > ? AND attempts < ?)`,
      ).run(hash, now, MAX_ATTEMPTS)
      return
    }
    const row = db.prepare("SELECT project_id FROM enrollment_codes WHERE hash = ?").get(hash) as { project_id: string }
    const deviceId = input.deviceId
    db.prepare(
      `INSERT INTO devices (id, project_id, platform, display_name, actual_state, desired_state, last_seen_at, battery_percent, app_version)
       VALUES (?, ?, ?, ?, 'off', 'off', ?, NULL, ?)`,
    ).run(deviceId, row.project_id, input.platform, input.displayName, now, input.appVersion)
    issued = { projectId: row.project_id, token: issueProjectToken(db, row.project_id, "device", deviceId), deviceId }
  })
  run()
  return issued
}

export type DeviceSummary = {
  id: string
  platform: string
  displayName: string
  actualState: string
  desiredState: string
  lastSeenAt: string | null
}

export function listDevices(db: AppDatabase, projectId: string): DeviceSummary[] {
  const rows = db
    .prepare(
      `SELECT id, platform, display_name, actual_state, desired_state, last_seen_at
       FROM devices WHERE project_id = ? ORDER BY display_name`,
    )
    .all(projectId) as {
    id: string
    platform: string
    display_name: string
    actual_state: string
    desired_state: string
    last_seen_at: string | null
  }[]
  return rows.map((row) => ({
    id: row.id,
    platform: row.platform,
    displayName: row.display_name,
    actualState: row.actual_state,
    desiredState: row.desired_state,
    lastSeenAt: row.last_seen_at,
  }))
}

/** Drops this device only. Other devices keep their tokens. */
export function removeDevice(db: AppDatabase, projectId: string, deviceId: string): boolean {
  const device = db.prepare("SELECT id FROM devices WHERE id = ? AND project_id = ?").get(deviceId, projectId)
  if (!device) return false
  const run = db.transaction(() => {
    const now = new Date().toISOString()
    db.prepare("UPDATE project_tokens SET revoked_at = ? WHERE project_id = ? AND device_id = ? AND revoked_at IS NULL").run(now, projectId, deviceId)
    db.prepare("DELETE FROM device_push_tokens WHERE device_id = ?").run(deviceId)
    db.prepare("DELETE FROM device_commands WHERE device_id = ?").run(deviceId)
    const objects = db.prepare("SELECT id FROM live_objects WHERE project_id = ? AND payload_json LIKE ?").all(projectId, `%"deviceId":"${deviceId}"%`) as {
      id: string
    }[]
    for (const object of objects) {
      db.prepare("DELETE FROM live_positions WHERE object_id = ?").run(object.id)
      db.prepare("DELETE FROM live_objects WHERE id = ?").run(object.id)
    }
    const sessions = db.prepare("SELECT id FROM track_sessions WHERE project_id = ? AND device_id = ?").all(projectId, deviceId) as { id: string }[]
    for (const session of sessions) db.prepare("DELETE FROM track_points WHERE session_id = ?").run(session.id)
    db.prepare("DELETE FROM track_sessions WHERE project_id = ? AND device_id = ?").run(projectId, deviceId)
    db.prepare("DELETE FROM devices WHERE id = ?").run(deviceId)
  })
  run()
  return true
}
