import { createId, type SnapshotEntity, type SyncOperation } from "@cartography/project-schema"

export type HistoryStep = {
  undo: SyncOperation[]
  redo: SyncOperation[]
}

function rowOf(docs: readonly SnapshotEntity[], operation: SyncOperation) {
  return docs.find((item) => item.entityType === operation.entityType && item.entityId === operation.entityId)
}

function copyPayload(payload: unknown): unknown {
  return payload == null ? payload : JSON.parse(JSON.stringify(payload)) as unknown
}

/**
 * One session step. Undo is the reverse edit, applied later with the version
 * the server has then. The journal itself is never rewound.
 */
export function historyStep(docs: readonly SnapshotEntity[], operations: readonly SyncOperation[]): HistoryStep | null {
  if (operations.length === 0) return null
  if (operations.some((operation) => operation.kind === "delete" && operation.entityType === "layer")) return null
  const undo: SyncOperation[] = []
  for (const operation of [...operations].reverse()) {
    if (operation.kind === "create") {
      undo.push({ ...operation, opId: createId(), kind: "delete", baseVersion: null, payload: undefined })
      continue
    }
    const row = rowOf(docs, operation)
    if (!row || row.deleted || row.payload == null) return null
    undo.push({ ...operation, opId: createId(), kind: "update", baseVersion: null, payload: copyPayload(row.payload) })
  }
  return { undo, redo: operations.map((operation) => ({ ...operation, payload: copyPayload(operation.payload) })) }
}

/** Fill baseVersion from the records we have now. A create of a tombstone becomes a restore. */
export function stampForNow(docs: readonly SnapshotEntity[], operations: readonly SyncOperation[]): SyncOperation[] {
  return operations.map((operation) => {
    const row = rowOf(docs, operation)
    if (operation.kind === "create" && row?.deleted) {
      return { ...operation, opId: createId(), kind: "update", baseVersion: row.version, payload: operation.payload }
    }
    if (operation.kind === "create") return { ...operation, opId: createId(), baseVersion: null }
    return { ...operation, opId: createId(), baseVersion: row?.version ?? operation.baseVersion }
  })
}
