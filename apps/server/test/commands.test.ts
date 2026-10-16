import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { migrate } from "../src/db/migrate.js"
import { openDatabase } from "../src/db/open.js"
import { ackCommand, issueCommand, readSelfCommand } from "../src/services/commands.js"
import { createEnrollment, redeemEnrollment } from "../src/services/enrollment.js"
import { createProject } from "../src/services/projects.js"

const migrationsDir = resolve(fileURLToPath(new URL("..", import.meta.url)), "migrations")

function setup() {
  const db = openDatabase(":memory:")
  migrate(db, migrationsDir)
  const created = createProject(db, "Field")
  const enrollment = createEnrollment(db, created.project.id, "http://127.0.0.1:3847")
  const redeemed = redeemEnrollment(db, { code: enrollment.code, deviceId: "phone-1", platform: "android", displayName: "Phone", appVersion: "0.1.0" })
  return { db, projectId: created.project.id, deviceId: redeemed?.deviceId ?? "" }
}

describe("device commands", () => {
  it("stays unconfirmed until the phone answers, and an old command is not offered", () => {
    const { db, projectId, deviceId } = setup()
    const issued = issueCommand(db, projectId, deviceId, "live")
    expect(issued?.mode).toBe("live")
    const open = readSelfCommand(db, projectId, deviceId, "2026-10-16T18:00:00.000Z")
    expect(open?.command?.id).toBe(issued?.id)
    expect(open?.controlled).toBe(true)
    expect(ackCommand(db, projectId, deviceId, { commandId: issued?.id, actual: "live" }, "2026-10-16T18:00:05.000Z")).toBe(true)
    expect(readSelfCommand(db, projectId, deviceId, "2026-10-16T18:00:10.000Z")?.command).toBeNull()
    expect(ackCommand(db, projectId, deviceId, { commandId: issued?.id, actual: "off" }, "2026-10-16T18:00:20.000Z")).toBe(true)
    const row = db.prepare("SELECT actual_state, result FROM devices d JOIN device_commands c ON c.device_id = d.id").get() as { actual_state: string; result: string }
    expect(row.actual_state).toBe("off")
    expect(row.result).toBe("live")
  })

  it("does not hand an expired command to the phone", () => {
    const { db, projectId, deviceId } = setup()
    const issued = issueCommand(db, projectId, deviceId, "track")
    expect(issued).not.toBeNull()
    db.prepare("UPDATE device_commands SET expires_at = ? WHERE id = ?").run("2026-10-16T17:00:00.000Z", issued?.id)
    expect(readSelfCommand(db, projectId, deviceId, "2026-10-16T18:00:00.000Z")?.command).toBeNull()
    expect(issueCommand(db, projectId, "missing", "off")).toBeNull()
    expect(readSelfCommand(db, projectId, "other", "2026-10-16T18:00:00.000Z")).toBeNull()
  })
})
