import { describe, expect, it } from "vitest"
import type { SnapshotEntity, SyncOperation } from "@cartography/project-schema"
import { historyStep, stampForNow } from "../src/app/undo.js"

const created: SyncOperation = {
  opId: "op",
  clientId: "c",
  projectId: "p",
  entityType: "feature",
  entityId: "f",
  kind: "create",
  baseVersion: null,
  payload: { id: "f", name: "Gate" },
}

describe("session undo", () => {
  it("turns a create into a delete and a later redo into a restore", () => {
    const step = historyStep([], [created])
    expect(step?.undo[0]?.kind).toBe("delete")
    const tombstone: SnapshotEntity = { entityType: "feature", entityId: "f", version: 2, deleted: true, payload: created.payload }
    const [redo] = stampForNow([tombstone], step?.redo ?? [])
    expect(redo?.kind).toBe("update")
    expect(redo?.baseVersion).toBe(2)
  })
})
