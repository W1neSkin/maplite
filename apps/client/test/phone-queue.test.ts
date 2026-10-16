import { describe, expect, it } from "vitest"
import type { SnapshotEntity, SyncOperation } from "@cartography/project-schema"
import { applyLocal, forgetOps, readPhoneCache, rememberOps, writePhoneCache } from "../src/app/phone-queue.js"

function memory(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) },
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  }
}

function createPoint(opId: string): SyncOperation {
  return {
    opId,
    clientId: "phone",
    projectId: "p",
    entityType: "feature",
    entityId: "point-1",
    kind: "create",
    baseVersion: null,
    payload: { id: "point-1", projectId: "p", layerId: "layer", geometry: { type: "Point", coordinates: [27.5, 53.9] }, properties: { name: "Here" } },
  }
}

describe("phone queue", () => {
  it("keeps a mark in the local picture and drops it from the queue after it is sent", () => {
    const storage = memory()
    const docs: SnapshotEntity[] = []
    const op = createPoint("op-1")
    const queued = rememberOps([], [op, op])
    const shown = applyLocal(docs, queued)
    writePhoneCache(storage, "p", { ops: queued, docs: shown })
    const loaded = readPhoneCache(storage, "p")
    expect(loaded.ops).toHaveLength(1)
    expect(loaded.docs).toHaveLength(1)
    expect(loaded.docs[0]?.entityId).toBe("point-1")
    const left = forgetOps(loaded.ops, new Set(["op-1"]))
    expect(left).toHaveLength(0)
  })
})
