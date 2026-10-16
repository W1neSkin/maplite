import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { migrate } from "../src/db/migrate.js"
import { openDatabase } from "../src/db/open.js"
import { createProject } from "../src/services/projects.js"
import { listLive, publishLive, type LiveEnvelope } from "../src/services/live.js"

const migrationsDir = resolve(fileURLToPath(new URL("..", import.meta.url)), "migrations")

function setup() {
  const db = openDatabase(":memory:")
  migrate(db, migrationsDir)
  const created = createProject(db, "Field")
  return { db, projectId: created.project.id }
}

function message(patch: Partial<LiveEnvelope> = {}): LiveEnvelope {
  return {
    type: "device",
    id: "phone-1",
    fixId: "fix-1",
    sampledAt: "2026-10-16T12:00:00.000Z",
    deviceId: "phone-1",
    body: { name: "Phone", sharing: true, longitude: 27.5, latitude: 53.9 },
    ...patch,
  }
}

describe("live channel", () => {
  it("keeps the newest fix and drops a late or repeated one", () => {
    const { db, projectId } = setup()
    expect(publishLive(db, projectId, message(), null)).toBe("ok")
    expect(publishLive(db, projectId, message(), null)).toBe("ok")
    expect(listLive(db, projectId)).toHaveLength(1)
    expect(publishLive(db, projectId, message({ fixId: "fix-2", sampledAt: "2026-10-16T11:00:00.000Z", body: { name: "Phone", sharing: true, longitude: 1, latitude: 2 } }), null)).toBe("stale")
    expect(listLive(db, projectId)[0]?.body.longitude).toBe(27.5)
    expect(publishLive(db, projectId, message({ fixId: "fix-3", sampledAt: "2026-10-16T12:00:20.000Z", body: { name: "Phone", sharing: true, longitude: 27.6, latitude: 53.9, courseDeg: 90 } }), null)).toBe("ok")
    const moved = listLive(db, projectId)[0]
    expect(moved?.body.longitude).toBe(27.6)
    expect(moved?.body.courseDeg).toBe(90)
    expect(moved?.body.trail).toEqual([[27.5, 53.9], [27.6, 53.9]])
    expect(publishLive(db, projectId, message({ fixId: "fix-4", sampledAt: "2026-10-16T12:00:40.000Z", body: { name: "Phone", sharing: true, longitude: 27.6, latitude: 53.9, courseDeg: 90 } }), null)).toBe("ok")
    expect(listLive(db, projectId)[0]?.body.trail).toEqual([[27.5, 53.9], [27.6, 53.9]])
  })

  it("removes the point when sharing stops and refuses another device id", () => {
    const { db, projectId } = setup()
    publishLive(db, projectId, message(), "phone-1")
    expect(publishLive(db, projectId, message({ id: "phone-2" }), "phone-1")).toBe("forbidden")
    expect(publishLive(db, projectId, message({ fixId: "off", body: { sharing: false, name: "Phone" } }), "phone-1")).toBe("ok")
    expect(listLive(db, projectId)).toHaveLength(0)
  })
})
