import { createId } from "@cartography/project-schema"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import "../extensions.js"
import { anchorOf } from "../map/anchor.js"
import { MapView, type MapHandle } from "../map/MapView.js"
import { paddingFromOverlays, type ScreenBox } from "../map/frame.js"
import { copyOperation, overwriteOperation } from "../sync/edits.js"
import { ConflictCard } from "./cards.js"
import { type Session } from "./connection.js"
import { CoordBar } from "./coords.js"
import { MapDock, PlacingBar, SyncActions } from "./dock.js"
import { ImportBody } from "./import-sheet.js"
import { loadBytes, type ImportOutcome } from "../import/load.js"
import { t } from "../i18n/translate.js"
import { LayerActions, LayerBrowser } from "./layers.js"
import { moveItem } from "./order.js"
import { Sheet } from "./Sheet.js"
import { useProject } from "./use-project.js"
import { readHidden, writeHidden } from "./view-state.js"

function boxOf(rect: DOMRect): ScreenBox {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

function measurePadding(stage: HTMLElement, sheet: HTMLElement, dock: HTMLElement | null, coord: HTMLElement | null): [number, number, number, number] {
  const overlays = [boxOf(sheet.getBoundingClientRect())]
  if (dock) overlays.push(boxOf(dock.getBoundingClientRect()))
  if (coord) overlays.push(boxOf(coord.getBoundingClientRect()))
  const zoom = stage.querySelector(".ol-zoom")
  if (zoom instanceof HTMLElement) overlays.push(boxOf(zoom.getBoundingClientRect()))
  return paddingFromOverlays(boxOf(stage.getBoundingClientRect()), overlays)
}

function nameOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const name = (payload as { properties?: { name?: unknown } }).properties?.name
  return typeof name === "string" ? name : ""
}

export function ProjectScreen({ session, onDisconnect, onBack }: { session: Session; onDisconnect: () => void; onBack: (() => void) | null }) {
  const project = useProject(session)
  const mapRef = useRef<MapHandle>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const dockRef = useRef<HTMLElement>(null)
  const coordRef = useRef<HTMLElement>(null)
  const [basemapFailed, setBasemapFailed] = useState(false)
  const [locationOff, setLocationOff] = useState(false)
  const [locating, setLocating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [openLayerId, setOpenLayerId] = useState<string | null>(null)
  const [placingLayerId, setPlacingLayerId] = useState<string | null>(null)
  const [placeName, setPlaceName] = useState("")
  const placeNameTouched = useRef(false)
  const [reveal, setReveal] = useState<{ id: string; token: number } | null>(null)
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [coordEdit, setCoordEdit] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(session.projectId ?? ""))
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<Uint8Array | null>(null)
  const status = project.upgrade ? t("upgradeRequired") : project.failed ? t("serverUnavailable") : basemapFailed ? t("basemapUnavailable") : locationOff ? t("locationOff") : null
  const openLayer = openLayerId ? project.model.layers.find((layer) => layer.id === openLayerId) ?? null : null
  const placingLayer = placingLayerId ? project.model.layers.find((layer) => layer.id === placingLayerId) ?? null : null

  useLayoutEffect(() => {
    const stage = stageRef.current
    const sheetEl = sheetRef.current
    if (!reveal || !stage || !sheetEl) return
    mapRef.current?.show(reveal.id, measurePadding(stage, sheetEl, dockRef.current, coordRef.current))
  }, [reveal])

  useEffect(() => setCoordEdit(false), [selectedId, placingLayerId])

  function markReveal(id: string) {
    setReveal((current) => ({ id, token: (current?.token ?? 0) + 1 }))
  }

  function pointLayers() {
    return project.model.layers.filter((layer) => layer.geometryType === "Point")
  }

  function suggestedName(layerId: string) {
    const count = project.model.features.filter((feature) => feature.layerId === layerId).length
    return t("defaultPointName", { n: count + 1 })
  }

  function startPlacing(layerId: string) {
    setPlacingLayerId(layerId)
    setOpenLayerId(layerId)
    setSelectedId(null)
    setSheet(false)
  }

  function beginAdd() {
    if (placingLayerId) {
      setPlacingLayerId(null)
      return
    }
    const points = pointLayers()
    const current = points.find((layer) => layer.id === openLayerId) ?? points[0]
    if (!current) {
      setSelectedId(null)
      setOpenLayerId(null)
      setSheet(true)
      return
    }
    placeNameTouched.current = false
    setPlaceName(suggestedName(current.id))
    startPlacing(current.id)
  }

  function choosePlaceLayer(layerId: string) {
    if (!placeNameTouched.current) setPlaceName(suggestedName(layerId))
    setPlacingLayerId(layerId)
    setOpenLayerId(layerId)
  }

  function selectFeature(id: string) {
    setSelectedId(id)
    const feature = project.model.features.find((item) => item.id === id)
    if (feature) setOpenLayerId(feature.layerId)
    setSheet(true)
    markReveal(id)
  }

  async function placeAt(coordinate: [number, number]) {
    const layerId = placingLayerId
    if (!layerId) return
    setPlacingLayerId(null)
    const name = placeName.trim() || suggestedName(layerId)
    const id = await project.createPoint(layerId, coordinate, name)
    if (!id) return
    setOpenLayerId(layerId)
    setSelectedId(id)
    setSheet(true)
    markReveal(id)
  }

  function syncNow() {
    void project.pull().catch(() => project.setFailed(true))
  }

  function toggleHidden(id: string) {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeHidden(session.projectId ?? "", next)
      return next
    })
  }

  async function locate() {
    setLocating(true)
    setLocationOff(false)
    const coordinate = (await mapRef.current?.locate()) ?? null
    setLocating(false)
    if (!coordinate) setLocationOff(true)
    else setCursor(coordinate)
  }

  async function readImport(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    zipRef.current = bytes
    setOutcome(loadBytes(file.name, bytes))
    setOpenLayerId(null)
    setSheet(true)
  }

  const selected = project.model.features.find((feature) => feature.id === selectedId) ?? null
  const selectedPoint = selected?.geometry.type === "Point" ? selected.geometry.coordinates : null
  const coordValue = !placingLayerId && selectedPoint ? selectedPoint : cursor
  const callout = selected && !placingLayerId && !hidden.has(selected.layerId)
    ? { coordinate: anchorOf(selected.geometry), title: selected.name, layer: project.model.layers.find((layer) => layer.id === selected.layerId)?.name ?? "" }
    : null

  return (
    <div ref={stageRef} className="relative h-full">
      <MapView
        ref={mapRef}
        features={project.model.features.filter((feature) => !hidden.has(feature.layerId))}
        selectedId={selectedId}
        placing={placingLayerId !== null}
        callout={callout}
        onBasemapFailed={setBasemapFailed}
        onPlace={(coordinate) => { setCursor(coordinate); void placeAt(coordinate) }}
        onCursor={setCursor}
        onLocated={setCursor}
        onSelect={(id) => { if (id) selectFeature(id); else setSelectedId(null) }}
      />
      {placingLayer ? (
        <PlacingBar
          name={placeName}
          onName={(name) => {
            placeNameTouched.current = true
            setPlaceName(name)
          }}
          layerId={placingLayer.id}
          layers={pointLayers()}
          onLayer={choosePlaceLayer}
          onClose={() => setPlacingLayerId(null)}
        />
      ) : null}
      {status && !placingLayer ? (
        <button type="button" className="absolute left-2 top-[max(8px,env(safe-area-inset-top))] z-20 max-w-[70%] truncate rounded-full bg-white px-3 py-1 text-xs shadow" role="status" onClick={() => { if (locationOff) void locate(); else syncNow() }}>
          {status}
        </button>
      ) : null}
      {sheet && !placingLayerId ? (
        <Sheet
          ref={sheetRef}
          title={outcome ? t("importData") : openLayer ? openLayer.name : t("layersTitle")}
          onClose={() => { if (outcome) { setOutcome(null); return }; if (openLayerId) setOpenLayerId(null); else setSheet(false) }}
          onRename={!outcome && openLayer ? (name) => void project.renameLayer(openLayer.id, name) : undefined}
          actions={!outcome && openLayer ? (
            <LayerActions
              geometryType={openLayer.geometryType}
              onAdd={beginAdd}
              onDelete={() => void project.deleteLayer(openLayer.id).then((ok) => { if (!ok) return; if (openLayerId === openLayer.id) setOpenLayerId(null); setSelectedId(null) })}
            />
          ) : null}
          footer={<SyncActions lastSync={project.lastSync} onSync={syncNow} onBack={onBack} onDisconnect={onDisconnect} />}
        >
          {outcome ? (
            <ImportBody
              outcome={outcome}
              onChoose={(name) => { const bytes = zipRef.current; if (bytes) setOutcome(loadBytes("archive.zip", bytes, name)) }}
              onConfirm={() => {
                if (outcome.kind !== "ready") return
                void project.importLayer(outcome).then((id) => {
                  if (!id) return
                  setOutcome(null)
                  setOpenLayerId(id)
                })
              }}
            />
          ) : (
          <LayerBrowser
            layers={project.model.layers}
            features={project.model.features}
            openLayerId={openLayerId}
            selectedId={selectedId}
            onOpenLayer={setOpenLayerId}
            onSelectFeature={selectFeature}
            onRenameFeature={project.renameFeature}
            onDeleteFeature={(id) => { project.deleteFeature(id); setSelectedId(null) }}
            onCreateLayer={(name) => void project.createPointLayer(name).then((id) => {
              if (!id) return
              placeNameTouched.current = false
              setPlaceName(t("defaultPointName", { n: 1 }))
              startPlacing(id)
            })}
            hidden={hidden}
            onToggleVisible={toggleHidden}
            onReorder={(from, to) => {
              const ids = moveItem(project.model.layers.map((layer) => layer.id), from, to)
              project.reorderLayers(ids)
            }}
            onImport={() => fileRef.current?.click()}
          />
          )}
        </Sheet>
      ) : null}
      {project.conflict ? (
        <Sheet title={t("conflictTitle")} onClose={() => project.setConflict(null)}>
          <ConflictCard
            serverName={nameOf(project.conflict.serverPayload)}
            localName={nameOf(project.conflict.operation.payload)}
            onKeep={() => { project.setConflict(null); void project.pull() }}
            onOverwrite={() => { const next = overwriteOperation(project.conflict!.operation, project.conflict!.serverVersion); project.setConflict(null); void project.send(next) }}
            onCopy={() => { const next = copyOperation(project.conflict!.operation, createId()); project.setConflict(null); void project.send(next) }}
          />
        </Sheet>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.geojson,.json,application/zip,application/geo+json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void readImport(file)
        }}
      />
      <CoordBar
        barRef={coordRef}
        value={coordValue}
        editing={coordEdit}
        canEdit={placingLayerId !== null || selectedPoint !== null}
        onEdit={() => setCoordEdit(true)}
        onCancel={() => setCoordEdit(false)}
        onSave={(coordinate) => {
          setCoordEdit(false)
          setCursor(coordinate)
          if (placingLayerId) void placeAt(coordinate)
          else if (selectedId && selectedPoint) project.movePoint(selectedId, coordinate)
        }}
      />
      <MapDock
        dockRef={dockRef}
        layersOpen={sheet && !placingLayerId}
        placing={placingLayerId !== null}
        locating={locating}
        disabled={project.failed || project.loading}
        onLayers={() => { setPlacingLayerId(null); setSheet((current) => !current) }}
        onAdd={beginAdd}
        onLocate={() => void locate()}
      />
    </div>
  )
}
