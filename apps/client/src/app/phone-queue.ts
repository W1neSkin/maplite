import type { SnapshotEntity, SyncOperation } from "@cartography/project-schema"
import { applyRemote } from "../sync/edits.js"

export type PhoneCache = { ops: SyncOperation[]; docs: SnapshotEntity[] }

const empty: PhoneCache = { ops: [], docs: [] }

function key(projectId: string): string {
  return `cartography.phoneQueue.${projectId}`
}

/** The phone WebView keeps this storage across a force-stop. The browser does not use it. */
export function readPhoneCache(storage: Storage, projectId: string): PhoneCache {
  try {
    const raw = storage.getItem(key(projectId))
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<PhoneCache>
    return {
      ops: Array.isArray(parsed.ops) ? parsed.ops : [],
      docs: Array.isArray(parsed.docs) ? parsed.docs : [],
    }
  } catch {
    return empty
  }
}

export function writePhoneCache(storage: Storage, projectId: string, cache: PhoneCache): void {
  const body = JSON.stringify(cache)
  try {
    storage.setItem(key(projectId), body)
  } catch {
    // A full store still keeps the operations. The map picture can be fetched again.
    try {
      storage.setItem(key(projectId), JSON.stringify({ ops: cache.ops, docs: [] }))
    } catch {
      // The mark stays on screen until this process ends.
    }
  }
}

export function rememberOps(existing: readonly SyncOperation[], incoming: readonly SyncOperation[]): SyncOperation[] {
  const seen = new Set(existing.map((op) => op.opId))
  const next = [...existing]
  for (const op of incoming) {
    if (seen.has(op.opId)) continue
    seen.add(op.opId)
    next.push(op)
  }
  return next
}

export function forgetOps(ops: readonly SyncOperation[], done: ReadonlySet<string>): SyncOperation[] {
  return ops.filter((op) => !done.has(op.opId))
}

/** Show the queued edit immediately. The same opId is what the server will accept later. */
export function applyLocal(docs: readonly SnapshotEntity[], ops: readonly SyncOperation[]): SnapshotEntity[] {
  return applyRemote(
    [...docs],
    ops.map((op) => ({
      seq: 0,
      entityType: op.entityType,
      entityId: op.entityId,
      version: op.baseVersion ?? 0,
      deleted: op.kind === "delete",
      payload: op.payload ?? null,
    })),
  )
}
