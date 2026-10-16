import { createId, type ControlPoint, type Feature, type JsonValue, type Layer, type LayerGroup, type SnapshotEntity, type SyncOperation } from "@cartography/project-schema"
import type { ImportReady } from "../import/load.js"
import { useCallback, useEffect, useRef, useState } from "react"
import { clientId, editOrigin, type Session } from "./connection.js"
import { buildMapModel, type MapModel } from "./model.js"
import { pushOps, readAll, readChanges, watchChanges } from "../sync/api.js"
import { applyRemote } from "../sync/edits.js"
import { deliveryOperations } from "./delivery.js"
import { historyStep, stampForNow, type HistoryStep } from "./undo.js"

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
  const [history, setHistory] = useState({ undo: 0, redo: 0 })
  const undoStack = useRef<HistoryStep[]>([])
  const redoStack = useRef<HistoryStep[]>([])
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
        undoStack.current = []
        redoStack.current = []
        setHistory({ undo: 0, redo: 0 })
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
    void watchChanges(session, controller.signal, (event) => {
      if (event === "changes-available") void pull().catch(() => setFailed(true))
    })
    const timer = window.setInterval(() => void pull().catch(() => setFailed(true)), 20_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [pull, session])

  function publishHistory() {
    setHistory({ undo: undoStack.current.length, redo: redoStack.current.length })
  }

  async function sendMany(operations: SyncOperation[], atomic = false, track = true): Promise<boolean> {
    if (!session.projectId || operations.length === 0) return false
    const step = track ? historyStep(docs, operations) : null
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
      if (step) {
        undoStack.current.push(step)
        redoStack.current = []
        publishHistory()
      }
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

  function play(direction: "undo" | "redo") {
    const source = direction === "undo" ? undoStack : redoStack
    const step = source.current.pop()
    if (!step) return
    void sendMany(stampForNow(docs, step[direction]), true, false).then((ok) => {
      if (ok) {
        const other = direction === "undo" ? redoStack : undoStack
        other.current.push(step)
      } else source.current.push(step)
      publishHistory()
    })
  }

  function versionOf(id: string): number {
    return docs.find((item) => item.entityId === id)?.version ?? 1
  }

  async function renameLayer(id: string, name: string) {
    const layer = layerOf(docs, id)
    if (!layer || !session.projectId) return
    await send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "layer", entityId: id, kind: "update", baseVersion: versionOf(id), payload: { ...layer, name } })
  }

  function restyleLayer(id: string, patch: { color?: string; fillOpacity?: number; labelAttribute?: string | null }) {
    const layer = layerOf(docs, id)
    if (!layer || !session.projectId) return
    const color = patch.color ?? layer.style.color
    const fillOpacity = patch.fillOpacity ?? layer.style.fillOpacity
    const labelAttribute = patch.labelAttribute === undefined ? layer.style.labelAttribute : patch.labelAttribute
    if (!/^#[0-9a-f]{6}$/i.test(color)) return
    const nextOpacity = Math.min(1, Math.max(0, fillOpacity))
    if (color.toLowerCase() === layer.style.color.toLowerCase() && nextOpacity === layer.style.fillOpacity && labelAttribute === layer.style.labelAttribute) return
    void send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "layer", entityId: id, kind: "update", baseVersion: versionOf(id), payload: { ...layer, style: { ...layer.style, color, fillOpacity: nextOpacity, labelAttribute } } })
  }

  async function deleteLayer(id: string): Promise<boolean> {
    if (!session.projectId) return false
    return send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "layer", entityId: id, kind: "delete", baseVersion: versionOf(id) })
  }

  async function createPointLayer(name: string, geometryType: Layer["geometryType"] = "Point", groupId: string | null = null): Promise<string | null> {
    if (!session.projectId) return null
    const id = createId()
    const payload: Layer = {
      id,
      projectId: session.projectId,
      groupId,
      name,
      geometryType,
      style: { color: "#2563eb", fillOpacity: geometryType === "Polygon" ? 0.28 : 0, strokeWidth: 2, labelAttribute: null },
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

  async function createFeature(layerId: string, geometry: Feature["geometry"], name: string): Promise<string | null> {
    if (!session.projectId) return null
    const id = createId()
    const payload: Feature = { id, projectId: session.projectId, layerId, geometry, properties: { name } }
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

  function updateGeometry(id: string, geometry: Feature["geometry"]) {
    const feature = featureOf(docs, id)
    if (!feature || feature.geometry.type !== geometry.type || !session.projectId) return
    if (JSON.stringify(feature.geometry) === JSON.stringify(geometry)) return
    void send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "feature", entityId: id, kind: "update", baseVersion: versionOf(id), payload: { ...feature, geometry } })
  }

  function movePoint(id: string, coordinate: [number, number]) {
    updateGeometry(id, { type: "Point", coordinates: [Number(coordinate[0].toFixed(6)), Number(coordinate[1].toFixed(6))] })
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

  async function createGroup(name: string): Promise<string | null> {
    if (!session.projectId) return null
    const id = createId()
    const payload: LayerGroup = { id, projectId: session.projectId, name, order: model.groups.length }
    const ok = await send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "layerGroup", entityId: id, kind: "create", baseVersion: null, payload })
    return ok ? id : null
  }

  function setLayerGroup(id: string, groupId: string | null) {
    const layer = layerOf(docs, id)
    if (!layer || layer.groupId === groupId || !session.projectId) return
    void send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "layer", entityId: id, kind: "update", baseVersion: versionOf(id), payload: { ...layer, groupId } })
  }

  function addControlPoint(input: { x: number; y: number; easting: number; northing: number }) {
    if (!session.projectId) return
    const projectId = session.projectId
    const existing = docs.find((item) => item.entityType === "controlNetwork" && !item.deleted)
    const networkId = existing?.entityId ?? createId()
    const operations: SyncOperation[] = []
    if (!existing) {
      operations.push({ opId: createId(), clientId: clientId(), projectId, entityType: "controlNetwork", entityId: networkId, kind: "create", baseVersion: null, payload: { id: networkId, projectId, name: "Local", targetCrsProfileId: "local", version: 1, tx: null, ty: null, scale: null, rotationRad: null, ppm: null, rmsM: null, maxResidualM: null } })
    }
    const id = createId()
    const count = docs.filter((item) => item.entityType === "controlPoint" && !item.deleted).length + 1
    const payload: ControlPoint = { id, projectId, networkId, name: `CP ${count}`, x: input.x, y: input.y, easting: input.easting, northing: input.northing, weight: 1, role: "fit", source: "map", note: "" }
    operations.push({ opId: createId(), clientId: clientId(), projectId, entityType: "controlPoint", entityId: id, kind: "create", baseVersion: null, payload })
    void sendMany(operations, true)
  }

  function deleteControlPoint(id: string) {
    if (!session.projectId) return
    void send({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "controlPoint", entityId: id, kind: "delete", baseVersion: versionOf(id) })
  }

  function seatFeatures(updates: readonly { id: string; geometry: Feature["geometry"] }[]) {
    if (!session.projectId) return
    const operations: SyncOperation[] = []
    for (const update of updates) {
      const feature = featureOf(docs, update.id)
      if (!feature) continue
      const sourceGeometry = feature.sourceGeometry ?? { coordinates: feature.geometry as unknown as JsonValue, crsProfileId: "local" }
      operations.push({ opId: createId(), clientId: clientId(), projectId: session.projectId, entityType: "feature", entityId: update.id, kind: "update", baseVersion: versionOf(update.id), payload: { ...feature, geometry: update.geometry, sourceGeometry } })
    }
    void sendMany(operations)
  }

  async function sendLayer(sourceId: string, audience: "all" | string[]): Promise<boolean> {
    const source = layerOf(docs, sourceId)
    if (!source || source.delivery || !session.projectId) return false
    const features = recordsIn(sourceId)
    let existing: { layer: Layer; version: number; features: { id: string; version: number }[] } | null = null
    for (const item of docs) {
      if (item.deleted || item.entityType !== "layer") continue
      const layer = item.payload as Layer
      if (layer.delivery?.sourceLayerId !== sourceId) continue
      const copies: { id: string; version: number }[] = []
      for (const row of docs) {
        if (row.deleted || row.entityType !== "feature") continue
        const feature = row.payload as Feature
        if (feature.layerId === layer.id) copies.push({ id: feature.id, version: row.version })
      }
      existing = { layer, version: item.version, features: copies }
      break
    }
    const operations = deliveryOperations({
      projectId: session.projectId,
      clientId: clientId(),
      source,
      features,
      existing,
      audience,
      order: docs.filter((item) => item.entityType === "layer" && !item.deleted).length,
    })
    if (!operations) return false
    return sendMany(operations, true, false)
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

  const controlPoints = docs.filter((item) => item.entityType === "controlPoint" && !item.deleted).map((item) => item.payload as ControlPoint)
  return { model, loading, failed, setFailed, upgrade, conflict, setConflict, lastSync, pull, send, renameLayer, restyleLayer, deleteLayer, createPointLayer, createGroup, setLayerGroup, createPoint, createFeature, renameFeature, deleteFeature, movePoint, updateGeometry, reorderLayers, importLayer, recordsIn, sendLayer, controlPoints, addControlPoint, deleteControlPoint, seatFeatures, canUndo: history.undo > 0, canRedo: history.redo > 0, undo: () => play("undo"), redo: () => play("redo") }
}
