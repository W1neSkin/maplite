import { createId, type Feature, type Layer, type SyncOperation } from "@cartography/project-schema"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { loadConfig } from "../src/config.js"
import { migrate } from "../src/db/migrate.js"
import { openDatabase } from "../src/db/open.js"
import { deleteProject, exportArchive, importArchive } from "../src/services/archive.js"
import { createEnrollment, redeemEnrollment, removeDevice } from "../src/services/enrollment.js"
import { createProject } from "../src/services/projects.js"
import { pushOperations } from "../src/services/sync.js"
import { readSnapshot } from "../src/services/snapshot.js"

const migrationsDir = resolve(fileURLToPath(new URL("..", import.meta.url)), "migrations")
const temp = mkdtempSync(join(tmpdir(), "cartography-sync-"))
const admin = "c".repeat(43)

afterAll(() => rmSync(temp, { recursive: true, force: true }))

function setup() {
  const db = openDatabase(":memory:")
  migrate(db, migrationsDir)
  const created = createProject(db, "Field")
  return { db, created }
}

function layerOp(projectId: string, layerId: string): SyncOperation {
  const payload: Layer = {
    id: layerId,
    projectId,
    groupId: null,
    name: "Points",
    geometryType: "Point",
    style: { color: "#1f4d3a", fillOpacity: 0, strokeWidth: 2, labelAttribute: null },
    source: null,
    status: "ready",
    order: 0,
  }
  return { opId: createId(), clientId: "client-a", projectId, entityType: "layer", entityId: layerId, kind: "create", baseVersion: null, payload }
}

function pointOp(projectId: string, layerId: string, featureId: string, name: string): SyncOperation {
  const payload: Feature = {
    id: featureId,
    projectId,
    layerId,
    geometry: { type: "Point", coordinates: [-0.16, 51.51] },
    properties: { name },
  }
  return { opId: createId(), clientId: "client-a", projectId, entityType: "feature", entityId: featureId, kind: "create", baseVersion: null, payload }
}

describe("sync", () => {
  it("keeps the writer of a point when another surface renames it", () => {
    const { db, created } = setup()
    const projectId = created.project.id
    const layerId = createId()
    const featureId = createId()
    const phone = { surface: "device" as const, deviceId: "phone-1" }
    const desk = { surface: "main" as const, deviceId: "desk-1" }
    pushOperations(db, projectId, { operations: [layerOp(projectId, layerId)] })
    const createdPoint = { ...pointOp(projectId, layerId, featureId, "Gate"), origin: phone }
    expect(pushOperations(db, projectId, { operations: [createdPoint] })?.results[0]?.status).toBe("applied")
    const renamed = {
      ...createdPoint,
      opId: createId(),
      kind: "update" as const,
      baseVersion: 1,
      origin: desk,
      payload: { ...createdPoint.payload, properties: { name: "North gate" } },
    }
    expect(pushOperations(db, projectId, { operations: [renamed] })?.results[0]?.status).toBe("applied")
    const stored = readSnapshot(db, projectId, null, 50)?.entities.find((entity) => entity.entityId === featureId)
    const payload = stored?.payload as { createdBy?: typeof phone; updatedBy?: typeof desk; properties: { name: string } }
    expect(payload.createdBy).toEqual(phone)
    expect(payload.updatedBy).toEqual(desk)
    expect(payload.properties.name).toBe("North gate")
  })

  it("applies an operation once and keeps both versions of a conflict", () => {
    const { db, created } = setup()
    const projectId = created.project.id
    const layerId = createId()
    const featureId = createId()
    expect(pushOperations(db, projectId, { operations: [layerOp(projectId, layerId)] })?.results[0]?.status).toBe("applied")
    const createdPoint = pointOp(projectId, layerId, featureId, "Gate")
    const first = pushOperations(db, projectId, { operations: [createdPoint] })
    const again = pushOperations(db, projectId, { operations: [createdPoint] })
    expect(first?.results[0]?.status).toBe("applied")
    expect(again?.results[0]?.status).toBe("duplicate")
    const live = readSnapshot(db, projectId, null, 50)?.entities.filter((entity) => entity.entityType === "feature" && !entity.deleted)
    expect(live).toHaveLength(1)

    const mine = { ...createdPoint, opId: createId(), kind: "update" as const, baseVersion: 1, payload: { ...createdPoint.payload, properties: { name: "Mine" } } }
    const theirs = { ...createdPoint, opId: createId(), clientId: "client-b", kind: "update" as const, baseVersion: 1, payload: { ...createdPoint.payload, properties: { name: "Theirs" } } }
    expect(pushOperations(db, projectId, { operations: [mine] })?.results[0]?.status).toBe("applied")
    const conflict = pushOperations(db, projectId, { operations: [theirs] })?.results[0]
    expect(conflict?.status).toBe("conflict")
    if (conflict?.status !== "conflict") return
    expect((conflict.serverPayload as Feature).properties.name).toBe("Mine")
    const overwrite = { ...theirs, opId: createId(), baseVersion: conflict.serverVersion }
    expect(pushOperations(db, projectId, { operations: [overwrite] })?.results[0]?.status).toBe("applied")
    const copy = pointOp(projectId, layerId, createId(), "Copy")
    expect(pushOperations(db, projectId, { operations: [copy] })?.results[0]?.status).toBe("applied")
    expect(readSnapshot(db, projectId, null, 50)?.entities.filter((entity) => entity.entityType === "feature" && !entity.deleted)).toHaveLength(2)
  })

  it("does not resurrect a tombstone and rolls back an atomic batch", () => {
    const { db, created } = setup()
    const projectId = created.project.id
    const layerId = createId()
    const featureId = createId()
    const layer = layerOp(projectId, layerId)
    const point = pointOp(projectId, layerId, featureId, "Gate")
    pushOperations(db, projectId, { operations: [layer, point] })
    const removed = pushOperations(db, projectId, {
      operations: [{ ...point, opId: createId(), kind: "delete", baseVersion: 1, payload: undefined }],
    })
    expect(removed?.results[0]?.status).toBe("applied")
    const resurrect = pushOperations(db, projectId, { operations: [{ ...point, opId: createId() }] })
    expect(resurrect?.results[0]?.status).toBe("conflict")
    if (resurrect?.results[0]?.status === "conflict") expect(resurrect.results[0].serverDeleted).toBe(true)
    const restored = pushOperations(db, projectId, {
      operations: [{ ...point, opId: createId(), kind: "update", baseVersion: 2, payload: point.payload }],
    })
    expect(restored?.results[0]?.status).toBe("applied")
    expect(readSnapshot(db, projectId, null, 50)?.entities.find((entity) => entity.entityId === featureId)?.deleted).toBe(false)
    const page = readSnapshot(db, projectId, null, 50)

    const extra = pointOp(projectId, layerId, createId(), "Extra")
    const stale = { ...point, opId: createId(), kind: "update" as const, baseVersion: 1, payload: point.payload }
    const atomic = pushOperations(db, projectId, { operations: [extra, stale], atomic: true })
    expect(atomic?.results.some((result) => result.status === "conflict")).toBe(true)
    expect(page && readSnapshot(db, projectId, null, 50)?.entities.some((entity) => entity.entityId === extra.entityId)).toBe(false)

    pushOperations(db, projectId, {
      operations: [{ ...layer, opId: createId(), kind: "delete", baseVersion: 1, payload: undefined }],
    })
    const afterDelete = readSnapshot(db, projectId, null, 50)
    expect(afterDelete?.entities.filter((entity) => !entity.deleted && entity.entityType === "feature")).toHaveLength(0)
  })

  it("restores an archive and revokes only one device", async () => {
    const { db, created } = setup()
    const projectId = created.project.id
    const layerId = createId()
    pushOperations(db, projectId, { operations: [layerOp(projectId, layerId), pointOp(projectId, layerId, createId(), "Gate")] })
    const archive = exportArchive(db, projectId)
    expect(archive).not.toBeNull()
    const imported = importArchive(db, archive!)
    expect(imported).not.toBe("invalid")
    if (imported === "invalid") return
    const restored = readSnapshot(db, imported.project.id, null, 50)
    expect(restored?.entities.filter((entity) => entity.entityType === "feature" && !entity.deleted)).toHaveLength(1)
    expect(deleteProject(db, imported.project.id)).toBe(true)
    expect(readSnapshot(db, imported.project.id, null, 50)).toBeNull()

    const enrollment = createEnrollment(db, projectId, "http://127.0.0.1:3847")
    const deviceId = createId()
    const redeemed = redeemEnrollment(db, { code: enrollment.code, deviceId, platform: "android", displayName: "Field phone", appVersion: "0.1.0" })
    expect(redeemed?.token).toBeTruthy()
    expect(redeemEnrollment(db, { code: enrollment.code, deviceId: createId(), platform: "android", displayName: "Other", appVersion: "0.1.0" })).toBeNull()

    const settings = loadConfig({
      NODE_ENV: "test",
      ADMIN_TOKEN: admin,
      SEED_DEMO: "false",
      ALLOW_DEV_CREDENTIALS_FILE: "false",
      DATABASE_PATH: join(temp, "unused.sqlite"),
    })
    const app = createApp(db, settings, { migrationsDir })
    const pushed = await app.request(`/api/v1/projects/${projectId}/sync/changes?after=0`, {
      headers: { authorization: `Bearer ${redeemed?.token}` },
    })
    expect(pushed.status).toBe(200)
    expect(removeDevice(db, projectId, deviceId)).toBe(true)
    const revoked = await app.request(`/api/v1/projects/${projectId}/sync/changes?after=0`, {
      headers: { authorization: `Bearer ${redeemed?.token}` },
    })
    expect(revoked.status).toBe(401)
    const editor = await app.request(`/api/v1/projects/${projectId}/sync/changes?after=0`, {
      headers: { authorization: `Bearer ${created.editorToken}` },
    })
    expect(editor.status).toBe(200)
  })
})
