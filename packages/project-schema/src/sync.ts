import type { EntityType } from "./entities.js"

export type SyncOperation = {
  opId: string
  clientId: string
  projectId: string
  entityType: EntityType
  entityId: string
  kind: "create" | "update" | "delete"
  baseVersion: number | null
  payload?: unknown
}

export type PushRequest = {
  operations: SyncOperation[]
  atomic?: boolean
}

export type OperationResult =
  | { opId: string; status: "applied" | "duplicate"; version: number; changeSeq: number }
  | { opId: string; status: "conflict"; serverVersion: number; serverPayload: unknown; serverDeleted: boolean }
  | { opId: string; status: "rejected"; code: string; message: string }

export type PushResponse = {
  results: OperationResult[]
  watermark: number
  schemaVersion: number
}

export type ChangeEnvelope = {
  seq: number
  entityType: EntityType
  entityId: string
  version: number
  deleted: boolean
  payload: unknown
}

export type ChangesResponse = {
  changes: ChangeEnvelope[]
  nextCursor: number
  hasMore: boolean
  watermark: number
  schemaVersion: number
}

export type SnapshotEntity = {
  entityType: EntityType
  entityId: string
  version: number
  deleted: boolean
  payload: unknown
}

export type SnapshotResponse = {
  entities: SnapshotEntity[]
  nextCursor: string | null
  hasMore: boolean
  watermark: number
  schemaVersion: number
}

export type PositionFixInput = {
  fixId: string
  deviceSeq: number
  sampledAt: string
  longitude: number
  latitude: number
  source?: string
  horizontalAccuracyM?: number | null
  speedMps?: number | null
  courseDeg?: number | null
}

export type StoredPosition = PositionFixInput & {
  objectId: string
  positionSeq: number
  receivedAt: string
}
