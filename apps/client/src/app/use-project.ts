import { createId, type ControlPoint, type Feature, type JsonValue, type Layer, type LayerGroup, type SnapshotEntity, type SyncOperation } from "@cartography/project-schema"
import type { ImportReady } from "../import/load.js"
import { useCallback, useEffect, useRef, useState } from "react"
import { clientId, editOrigin, isPhoneApp, type Session } from "./connection.js"
import { buildMapModel, type MapModel } from "./model.js"
import { readDurable, writeDurable } from "./outbox.js"
import { applyLocal, forgetOps, readPhoneCache, rememberOps } from "./phone-queue.js"
import { pushOps, readAll, readChanges, watchChanges } from "../sync/api.js"
import { applyRemote } from "../sync/edits.js"
import { deliveryOperations } from "./delivery.js"
import { movedIds } from "./walk.js"
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
  const phone = isPhoneApp()
  const cached = session.projectId ? readPhoneCache(localStorage, session.projectId) : { ops: [], docs: [] }
  const box = useRef(cached)
  const cursor = useRef(0)
  const [docs, setDocs] = useState<SnapshotEntity[]>(cached.docs)
  const [loading, setLoading] = useState(cached.docs.length === 0)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(cached.ops.length)
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
    if (page.changes.length > 0) {
      setDocs((current) => {
        const next = applyRemote(current, page.changes)
        if (session.projectId) {
          const cache = { ops: box.current.ops, docs: next }
          box.current = cache
          void writeDurable(session.projectId, cache)
        }
        return next
      })
    }
    cursor.current = page.nextCursor
    setLastSync(new Date().toISOString())
    setFailed(false)
    if (page.hasMore) await pull()
  }, [phone, session])

  const flushPending = useCallback(async () => {
    if (!session.projectId) return
    const projectId = session.projectId
    let guard = 0
    while (guard < 20) {
      guard += 1
      const cache = box.current
      if (cache.ops.length === 0) {
        setPending(0)
        return
      }
      const batch = cache.ops.slice(0, 200)
      const response = await pushOps(session, batch, false)
      const done = new Set<string>()
      for (const result of response.results) {
        if (result.status === "applied" || result.status === "duplicate" || result.status === "rejected") done.add(result.opId)
        if (result.status === "conflict") {
          done.add(result.opId)
          const operation = batch.find((item) => item.opId === result.opId) ?? batch[0]
          if (operation) setConflict({ operation, serverVersion: result.serverVersion, serverPayload: result.serverPayload, serverDeleted: result.serverDeleted })
        }
      }
      if (done.size === 0) return
      const left = forgetOps(cache.ops, done)
      const next = { ops: left, docs: box.current.docs }
      box.current = next
      await writeDurable(projectId, next)
      setPending(left.length)
      await pull()
      if (left.length === 0) return
    }
  }, [pull, session])

  useEffect(() => {
    let cancelled = false
    const loadStored = session.projectId ? readDurable(session.projectId) : Promise.resolve(box.current)
    void loadStored.then((stored) => {
      if (cancelled) return
      box.current = stored
      if (stored.docs.length > 0) setDocs(stored.docs)
      setPending(stored.ops.length)
      if (stored.docs.length === 0) setLoading(true)
      return readAll(session)
    }).then((loaded) => {
        if (cancelled || !loaded) return
        if (loaded.schemaVersion !== 1) setUpgrade(true)
        const ops = box.current.ops
        const merged = ops.length > 0 ? applyLocal(loaded.entities, ops) : loaded.entities
        const cache = { ops, docs: merged }
        box.current = cache
        setDocs(merged)
        if (session.projectId) void writeDurable(session.projectId, cache)
        setPending(ops.length)
        cursor.current = loaded.watermark
        undoStack.current = []
        redoStack.current = []
        setHistory({ undo: 0, redo: 0 })
        setLastSync(new Date().toISOString())
        setFailed(false)
        if (ops.length > 0) void flushPending().catch(() => setFailed(true))
      })
      .catch(() => {
        if (!cancelled && box.current.docs.length === 0) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [flushPending, phone, session])

  useEffect(() => {
    const controller = new AbortController()
    void watchChanges(session, controller.signal, (event) => {
      if (event === "changes-available") void pull().catch(() => setFailed(true))
    })
    const timer = window.setInterval(() => {
      const waiting = box.current.ops.length
      const job = waiting > 0 ? flushPending() : pull()
      void job.catch(() => setFailed(true))
    }, 20_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [flushPending, phone, pull, session])

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
      if (error instanceof Error && error.message === "upgrade") {
        setUpgrade(true)
        return false
      }
      // Offline edits wait and are sent again with the same opId. The phone file is SQLite.
      const offline = error instanceof TypeError
      if (session.projectId && (phone || offline)) {
        const projectId = session.projectId
        const ops = rememberOps(box.current.ops, stamped)
        const next = applyLocal(docs, stamped)
        const cache = { ops, docs: next }
        box.current = cache
        setDocs(next)
        setPending(ops.length)
        await writeDurable(projectId, cache)
        if (step) {
          undoStack.current.push(step)
          redoStack.current = []
          publishHistory()
        }
        return true
      }
      setFailed(true)
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

  async function createPoint(layerId: string, coordinate: [number, number], name: string, extra: Record<string, JsonValue> = {}): Promise<string | null> {
    if (!session.projectId) return null
    const id = createId()
    const payload: Feature = {
      id,
      projectId: session.projectId,
      layerId,
      geometry: { type: "Point", coordinates: [Number(coordinate[0].toFixed(6)), Number(coordinate[1].toFixed(6))] },
      properties: { name, ...extra },
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

  /** List order is the walk. The first move numbers every point; later moves change only the ones that shifted. */
  function moveFeature(id: string, direction: -1 | 1) {
    const feature = featureOf(docs, id)
    const projectId = session.projectId
    if (!feature || !projectId) return
    const ids = model.features.filter((item) => item.layerId === feature.layerId).map((item) => item.id)
    const next = movedIds(ids, id, direction)
    if (!next) return
    const operations: SyncOperation[] = []
    next.forEach((featureId, walk) => {
      const current = featureOf(docs, featureId)
      if (!current || current.properties.walk === walk) return
      operations.push({
        opId: createId(),
        clientId: clientId(),
        projectId,
        entityType: "feature",
        entityId: featureId,
        kind: "update",
        baseVersion: versionOf(featureId),
        payload: { ...current, properties: { ...current.properties, walk } },
      })
    })
    void sendMany(operations)
  }

  /**
   * One line or polygon for a point layer. Building again replaces that shape.
   * The ring is stored closed. The caller passes the walk order, not a closed ring.
   */
  async function saveBuiltShape(input: {
    sourceLayerId: string
    name: string
    groupId: string | null
    kind: "LineString" | "Polygon"
    coordinates: [number, number][]
    pointIds: string[]
  }): Promise<string | null> {
    const projectId = session.projectId
    if (!projectId || input.coordinates.length === 0) return null
    const geometry: Feature["geometry"] = input.kind === "LineString"
      ? { type: "LineString", coordinates: input.coordinates }
      : { type: "Polygon", coordinates: [[...input.coordinates, input.coordinates[0]!]] }
    const derived = { layerId: input.sourceLayerId, pointIds: input.pointIds }
    const existing = docs.find((item) => {
      if (item.deleted || item.entityType !== "layer") return false
      const layer = item.payload as Layer
      return layer.derivedFrom?.layerId === input.sourceLayerId && layer.geometryType === input.kind
    })
    if (existing) {
      const layer = existing.payload as Layer
      const featureRow = docs.find((item) => !item.deleted && item.entityType === "feature" && (item.payload as Feature).layerId === layer.id)
      const operations: SyncOperation[] = []
      if (JSON.stringify(layer.derivedFrom) !== JSON.stringify(derived)) {
        operations.push({ opId: createId(), clientId: clientId(), projectId, entityType: "layer", entityId: layer.id, kind: "update", baseVersion: existing.version, payload: { ...layer, derivedFrom: derived } })
      }
      if (featureRow) {
        const feature = featureRow.payload as Feature
        if (JSON.stringify(feature.geometry) !== JSON.stringify(geometry)) {
          operations.push({ opId: createId(), clientId: clientId(), projectId, entityType: "feature", entityId: feature.id, kind: "update", baseVersion: featureRow.version, payload: { ...feature, geometry } })
        }
      } else {
        const featureId = createId()
        operations.push({ opId: createId(), clientId: clientId(), projectId, entityType: "feature", entityId: featureId, kind: "create", baseVersion: null, payload: { id: featureId, projectId, layerId: layer.id, geometry, properties: { name: input.name } } })
      }
      if (operations.length === 0) return layer.id
      return (await sendMany(operations, true)) ? layer.id : null
    }
    const layerId = createId()
    const featureId = createId()
    const layer: Layer = {
      id: layerId,
      projectId,
      groupId: input.groupId,
      name: input.name,
      geometryType: input.kind,
      style: { color: "#2563eb", fillOpacity: input.kind === "Polygon" ? 0.28 : 0, strokeWidth: 2, labelAttribute: null },
      source: { format: "derived" },
      status: "ready",
      derivedFrom: derived,
      order: model.layers.length,
    }
    const feature: Feature = { id: featureId, projectId, layerId, geometry, properties: { name: input.name } }
    const ok = await sendMany([
      { opId: createId(), clientId: clientId(), projectId, entityType: "layer", entityId: layerId, kind: "create", baseVersion: null, payload: layer },
      { opId: createId(), clientId: clientId(), projectId, entityType: "feature", entityId: featureId, kind: "create", baseVersion: null, payload: feature },
    ], true)
    return ok ? layerId : null
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
  return { model, loading, failed, setFailed, pending, flush: () => flushPending().catch(() => setFailed(true)), upgrade, conflict, setConflict, lastSync, pull, send, renameLayer, restyleLayer, deleteLayer, createPointLayer, createGroup, setLayerGroup, createPoint, createFeature, renameFeature, deleteFeature, movePoint, moveFeature, updateGeometry, reorderLayers, saveBuiltShape, importLayer, recordsIn, sendLayer, controlPoints, addControlPoint, deleteControlPoint, seatFeatures, canUndo: history.undo > 0, canRedo: history.redo > 0, undo: () => play("undo"), redo: () => play("redo") }
}
