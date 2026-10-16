import { createId, type Feature, type JsonValue, type Layer, type SnapshotEntity, type SyncOperation } from "@cartography/project-schema"
import type { ImportReady } from "../import/load.js"
import { useCallback, useEffect, useRef, useState } from "react"
import { clientId, editOrigin, type Session } from "./connection.js"
import { buildMapModel, type MapModel } from "./model.js"
import { pushOps, readAll, readChanges, watchChanges } from "../sync/api.js"
import { applyRemote } from "../sync/edits.js"

export type Conflict = { operation: SyncOperation; serverVersion: number; serverPayload: unknown; serverDeleted: boolean }

function snapshotOf(entities: SnapshotEntity[]) {
  return { entities, nextCursor: null, hasMore: false, watermark: 0, schemaVersion: 1 }
}

function featureOf(docs: SnapshotEntity[], id: string): Feature | null {
  const row = docs.find((item) => item.entityType === "feature" && item.entityId === id && !item.deleted)
  return row ? (row.payload as Feature) : null
}

function layerOf(docs: SnapshotEntity[], id: string): Layer | null {
  const row = docs.find((item) => item.entityType === "layer" && item.entityId === id && !item.deleted)
  return row ? (row.payload as Layer) : null
}

export function useProject(session: Session) {
  const cursor = useRef(0)
  const [docs, setDocs] = useState<SnapshotEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [upgrade, setUpgrade] = useState(false)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const model: MapModel = buildMapModel(snapshotOf(docs))

  const pull = useCallback(async () => {
    const page = await readChanges(session, cursor.current)
    if (page.schemaVersion !== 1) {
      setUpgrade(true)
      return
    }
    if (page.changes.length > 0) setDocs((current) => applyRemote(current, page.changes))
    cursor.current = page.nextCursor
    setLastSync(new Date().toISOString())
    setFailed(false)
    if (page.hasMore) await pull()
  }, [session])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    readAll(session)
      .then((loaded) => {
        if (cancelled) return
        if (loaded.schemaVersion !== 1) setUpgrade(true)
        setDocs(loaded.entities)
        cursor.current = loaded.watermark
        setLastSync(new Date().toISOString())
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    const controller = new AbortController()
    void watchChanges(session, controller.signal, () => void pull().catch(() => setFailed(true)))
    const timer = window.setInterval(() => void pull().catch(() => setFailed(true)), 20_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [pull, session])

  async function sendMany(operations: SyncOperation[], atomic = false): Promise<boolean> {
    if (!session.projectId || operations.length === 0) return false
    const stamped = operations.map((operation) => ({ ...operation, origin: editOrigin() }))
    setFailed(false)
    try {
      const response = await pushOps(session, stamped, atomic)
      const conflicted = response.results.find((result) => result.status === "conflict")
      if (conflicted && conflicted.status === "conflict") {
        const operation = stamped.find((item) => item.opId === conflicted.opId) ?? stamped[0]
        setConflict({ operation, serverVersion: conflicted.serverVersion, serverPayload: conflicted.serverPayload, serverDeleted: conflicted.serverDeleted })
        return false
      }
      if (response.results.some((result) => result.status === "rejected")) return false
      await pull()
      return true
    } catch (error) {
      if (error instanceof Error && error.message === "upgrade") setUpgrade(true)
      else setFailed(true)
      return false
    }
  }

  function send(operation: SyncOperation): Promise<boolean> {
    return sendMany([operation])
  }

  function versionOf(id: string): number {
    return docs.find((item) => item.entityId === id)?.version ?? 1
  }

  async function renameLayer(id: string, name: string) {
    const layer = layerOf(docs, id)
    if (!layer || !session.projectId) return
    await send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "layer", entityId: id, kind: "update", baseVersion: versionOf(id), payload: { ...layer, name } })
  }

  async function deleteLayer(id: string): Promise<boolean> {
    if (!session.projectId) return false
    return send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "layer", entityId: id, kind: "delete", baseVersion: versionOf(id) })
  }

  async function createPointLayer(name: string): Promise<string | null> {
    if (!session.projectId) return null
    const id = createId()
    const payload: Layer = {
      id,
      projectId: session.projectId,
      groupId: null,
      name,
      geometryType: "Point",
      style: { color: "#2563eb", fillOpacity: 0, strokeWidth: 2, labelAttribute: null },
      source: null,
      status: "ready",
      order: model.layers.length,
    }
    const ok = await send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "layer", entityId: id, kind: "create", baseVersion: null, payload })
    return ok ? id : null
  }

  async function createPoint(layerId: string, coordinate: [number, number], name: string): Promise<string | null> {
    if (!session.projectId) return null
    const id = createId()
    const payload: Feature = {
      id,
      projectId: session.projectId,
      layerId,
      geometry: { type: "Point", coordinates: [Number(coordinate[0].toFixed(6)), Number(coordinate[1].toFixed(6))] },
      properties: { name },
    }
    const ok = await send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "feature", entityId: id, kind: "create", baseVersion: null, payload })
    return ok ? id : null
  }

  function renameFeature(id: string, name: string) {
    const feature = featureOf(docs, id)
    if (!feature || !session.projectId) return
    void send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "feature", entityId: id, kind: "update", baseVersion: versionOf(id), payload: { ...feature, properties: { ...feature.properties, name } } })
  }

  function deleteFeature(id: string) {
    if (!session.projectId) return
    void send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "feature", entityId: id, kind: "delete", baseVersion: versionOf(id) })
  }

  function movePoint(id: string, coordinate: [number, number]) {
    const feature = featureOf(docs, id)
    if (!feature || feature.geometry.type !== "Point" || !session.projectId) return
    const geometry: Feature["geometry"] = { type: "Point", coordinates: [Number(coordinate[0].toFixed(6)), Number(coordinate[1].toFixed(6))] }
    void send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "feature", entityId: id, kind: "update", baseVersion: versionOf(id), payload: { ...feature, geometry } })
  }

  function reorderLayers(ids: readonly string[]) {
    if (!session.projectId) return
    const operations: SyncOperation[] = []
    ids.forEach((id, index) => {
      const layer = layerOf(docs, id)
      if (!layer || layer.order === index || !session.projectId) return
      operations.push({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "layer", entityId: id, kind: "update", baseVersion: versionOf(id), payload: { ...layer, order: index } })
    })
    void sendMany(operations)
  }

  async function importLayer(ready: ImportReady): Promise<string | null> {
    if (!session.projectId) return Promise.resolve(null)
    const projectId = session.projectId
    const layerId = createId()
    const layer: Layer = {
      id: layerId,
      projectId,
      groupId: null,
      name: ready.name,
      geometryType: ready.geometryType,
      style: { color: "#2563eb", fillOpacity: ready.geometryType === "Polygon" ? 0.28 : 0, strokeWidth: 2, labelAttribute: null },
      source: { format: ready.crsWkt ? "shapefile" : "geojson", originalName: ready.name, crsWkt: ready.crsWkt ?? undefined, crsProfileId: ready.profileId ?? undefined, operationId: ready.operationId ?? undefined },
      status: "ready",
      order: model.layers.length,
    }
    const operations: SyncOperation[] = [{ opId: createId(), clientId: clientId(), projectId, entityType: "layer", entityId: layerId, kind: "create", baseVersion: null, payload: layer }]
    for (const feature of ready.features) {
      const id = createId()
      const payload: Feature = { id, projectId, layerId, geometry: feature.geometry, properties: feature.properties as Record<string, JsonValue> }
      operations.push({ opId: createId(), clientId: clientId(), projectId, entityType: "feature", entityId: id, kind: "create", baseVersion: null, payload })
    }
    const ok = await sendMany(operations, true)
    return ok ? layerId : null
  }

  function recordsIn(layerId: string): Feature[] {
    const records: Feature[] = []
    for (const item of docs) {
      if (item.deleted || item.entityType !== "feature") continue
      const feature = item.payload as Feature
      if (feature.layerId === layerId) records.push(feature)
    }
    return records
  }

  return { model, loading, failed, setFailed, upgrade, conflict, setConflict, lastSync, pull, send, renameLayer, deleteLayer, createPointLayer, createPoint, renameFeature, deleteFeature, movePoint, reorderLayers, importLayer, recordsIn }
}
