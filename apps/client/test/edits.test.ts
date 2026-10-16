import { describe, expect, it } from "vitest"
import type { ChangeEnvelope, SyncOperation } from "@cartography/project-schema"
import { applyRemote, copyOperation, overwriteOperation } from "../src/sync/edits.js"

const operation: SyncOperation = {
  opId: "op-1",
  clientId: "client",
  projectId: "project",
  entityType: "feature",
  entityId: "feature-1",
  kind: "update",
  baseVersion: 1,
  payload: { id: "feature-1", properties: { name: "Mine" } },
}

describe("remote edits", () => {
  it("applies a tombstone over the local copy", () => {
    const change: ChangeEnvelope = {
      seq: 2,
      entityType: "feature",
      entityId: "feature-1",
      version: 2,
      deleted: true,
      payload: { id: "feature-1" },
    }
    const next = applyRemote([{ entityType: "feature", entityId: "feature-1", version: 1, deleted: false, payload: { id: "feature-1" } }], [change])
    expect(next[0]?.deleted).toBe(true)
    expect(next[0]?.version).toBe(2)
  })

  it("builds overwrite and copy operations without reusing the old id", () => {
    const overwrite = overwriteOperation(operation, 4)
    expect(overwrite.baseVersion).toBe(4)
    expect(overwrite.opId).not.toBe(operation.opId)
    const copy = copyOperation(operation, "feature-2")
    expect(copy.kind).toBe("create")
    expect(copy.entityId).toBe("feature-2")
    expect(copy.baseVersion).toBeNull()
  })
})
