import { SCHEMA_VERSION, type ChangeEnvelope, type PushRequest, type PushResponse, type SnapshotEntity, type SyncOperation } from "@cartography/project-schema"

export function applyRemote(docs: SnapshotEntity[], changes: readonly ChangeEnvelope[]): SnapshotEntity[] {
  const next = [...docs]
  for (const change of changes) {
    const row: SnapshotEntity = {
      entityType: change.entityType,
      entityId: change.entityId,
      version: change.version,
      deleted: change.deleted,
      payload: change.payload,
    }
    const index = next.findIndex((item) => item.entityType === change.entityType && item.entityId === change.entityId)
    if (index >= 0) next[index] = row
    else next.push(row)
  }
  return next
}

export function overwriteOperation(op: SyncOperation, serverVersion: number): SyncOperation {
  return { ...op, opId: crypto.randomUUID(), baseVersion: serverVersion }
}

export function copyOperation(op: SyncOperation, entityId: string): SyncOperation {
  const payload = op.payload && typeof op.payload === "object" ? { ...(op.payload as Record<string, unknown>), id: entityId } : op.payload
  return { ...op, opId: crypto.randomUUID(), entityId, kind: "create", baseVersion: null, payload }
}

export function pushBody(operations: SyncOperation[]): PushRequest {
  return { operations, schemaVersion: SCHEMA_VERSION }
}

export type { PushResponse }
