import { averagePositions, geodesicLength, solveSimilarity } from "@cartography/geo-core"
import { createId } from "@cartography/project-schema"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import "../extensions.js"
import { anchorOf } from "../map/anchor.js"
import { readDisplayDatum, writeDisplayDatum, zoneProfile, type DisplayDatum } from "../map/display-crs.js"
import { MapView, type MapHandle } from "../map/MapView.js"
import { ensureProjection } from "../map/register-crs.js"
import { featureBounds } from "../map/bounds.js"
import { groundOf, seatGeometry } from "../map/seat.js"
import { paddingFromOverlays, type ScreenBox } from "../map/frame.js"
import { copyOperation, overwriteOperation } from "../sync/edits.js"
import { showsLayer } from "./audience.js"
import { ConflictCard } from "./cards.js"
import { editOrigin, type Session } from "./connection.js"
import { ControlPanel } from "./control-panel.js"
import { DevicesPanel } from "./devices-panel.js"
import { collectFixes } from "./field.js"
import { Legend } from "./legend.js"
import { CoordBar } from "./coords.js"
import { MapDock, MeasureBar, PlacingBar, SyncActions } from "./dock.js"
import { ImportBody } from "./import-sheet.js"
import { loadBytes, type ImportOutcome } from "../import/load.js"
import { saveZip } from "../import/save-zip.js"
import { layerZip } from "../import/write-shp.js"
import { formatLength } from "../i18n/format.js"
import { t } from "../i18n/translate.js"
import { labelFields, LayerStyle } from "./layer-style.js"
import { LayerActions, LayerBrowser } from "./layers.js"
import { groupedIds } from "./order.js"
import { SendPanel } from "./send-panel.js"
import { Sheet } from "./Sheet.js"
import { useLive } from "./use-live.js"
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
  const north = stage.querySelector(".map-north")
  if (north instanceof HTMLElement) overlays.push(boxOf(north.getBoundingClientRect()))
  return paddingFromOverlays(boxOf(stage.getBoundingClientRect()), overlays)
}

function nameOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const name = (payload as { properties?: { name?: unknown } }).properties?.name
  return typeof name === "string" ? name : ""
}

export function ProjectScreen({ session, onDisconnect, onBack, onJoined }: { session: Session; onDisconnect: () => void; onBack: (() => void) | null; onJoined: (session: Session) => void }) {
  const project = useProject(session)
  const live = useLive(session)
  const surface = editOrigin().surface
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
  const [vertices, setVertices] = useState<[number, number][]>([])
  const [styleOpen, setStyleOpen] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [ruler, setRuler] = useState<[number, number][]>([])
  const [controlsOpen, setControlsOpen] = useState(false)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [sendLayerId, setSendLayerId] = useState<string | null>(null)
  const [controlPick, setControlPick] = useState(false)
  const [controlDraft, setControlDraft] = useState<[number, number] | null>(null)
  const [fieldBusy, setFieldBusy] = useState(false)
  const placeNameTouched = useRef(false)
  const [reveal, setReveal] = useState<{ id: string; token: number } | null>(null)
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [coordEdit, setCoordEdit] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(session.projectId ?? ""))
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const [datum, setDatum] = useState<DisplayDatum>(() => readDisplayDatum())
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<Uint8Array | null>(null)
  const status = project.upgrade ? t("upgradeRequired") : project.pending > 0 ? t("pendingChanges", { count: project.pending }) : project.failed ? t("serverUnavailable") : basemapFailed ? t("basemapUnavailable") : locationOff ? t("locationOff") : null
  const shownLayers = project.model.layers.filter((layer) => showsLayer(layer.delivery, surface, session.deviceId))
  const shownIds = new Set(shownLayers.map((layer) => layer.id))
  const openLayer = openLayerId ? shownLayers.find((layer) => layer.id === openLayerId) ?? null : null
  useEffect(() => setStyleOpen(false), [openLayerId])
  const placingLayer = placingLayerId ? project.model.layers.find((layer) => layer.id === placingLayerId) ?? null : null

  useLayoutEffect(() => {
    const stage = stageRef.current
    const sheetEl = sheetRef.current
    if (!reveal || !stage || !sheetEl) return
    mapRef.current?.show(reveal.id, measurePadding(stage, sheetEl, dockRef.current, coordRef.current))
  }, [reveal])

  useEffect(() => setCoordEdit(false), [selectedId, placingLayerId])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()
      if (key !== "z" && key !== "y") return
      event.preventDefault()
      if (key === "y" || event.shiftKey) project.redo()
      else project.undo()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [project])

  function markReveal(id: string) {
    setReveal((current) => ({ id, token: (current?.token ?? 0) + 1 }))
  }

  function pointLayers() {
    return project.model.layers.filter((layer) => layer.geometryType === "Point")
  }

  function suggestedName(layerId: string) {
    const layer = project.model.layers.find((item) => item.id === layerId)
    const count = project.model.features.filter((feature) => feature.layerId === layerId).length
    const key = layer?.geometryType === "LineString" ? "defaultLineName" : layer?.geometryType === "Polygon" ? "defaultPolygonName" : "defaultPointName"
    return t(key, { n: count + 1 })
  }

  function startPlacing(layerId: string) {
    setVertices([])
    setPlacingLayerId(layerId)
    setOpenLayerId(layerId)
    setSelectedId(null)
    setSheet(false)
  }

  function stopMeasure() {
    setMeasuring(false)
    setRuler([])
  }

  function beginAdd() {
    stopMeasure()
    if (placingLayerId) {
      setPlacingLayerId(null)
      setVertices([])
      return
    }
    const currentLayer = project.model.layers.find((layer) => layer.id === openLayerId)
    const points = pointLayers()
    const current = currentLayer ?? points[0]
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
    setVertices([])
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

  function toggleMeasure() {
    if (measuring) {
      stopMeasure()
      return
    }
    setPlacingLayerId(null)
    setVertices([])
    setSheet(false)
    setSelectedId(null)
    setMeasuring(true)
    setRuler([])
  }

  async function placeAt(coordinate: [number, number]) {
    const layer = placingLayer
    if (!layer) return
    const rounded: [number, number] = [Number(coordinate[0].toFixed(6)), Number(coordinate[1].toFixed(6))]
    if (layer.geometryType !== "Point") {
      setVertices((current) => [...current, rounded])
      setCursor(rounded)
      return
    }
    const layerId = layer.id
    setPlacingLayerId(null)
    const name = placeName.trim() || suggestedName(layerId)
    const id = await project.createPoint(layerId, rounded, name)
    if (!id) return
    setOpenLayerId(layerId)
    setSelectedId(id)
    setSheet(true)
    markReveal(id)
  }

  async function finishShape() {
    const layer = placingLayer
    if (!layer || layer.geometryType === "Point") return
    if (layer.geometryType === "LineString" && vertices.length < 2) return
    if (layer.geometryType === "Polygon" && vertices.length < 3) return
    const name = placeName.trim() || suggestedName(layer.id)
    // A polygon ring must repeat its first vertex. The sketch itself stays open until this moment.
    const geometry = layer.geometryType === "LineString"
      ? { type: "LineString" as const, coordinates: vertices }
      : { type: "Polygon" as const, coordinates: [[...vertices, vertices[0]!]] }
    setPlacingLayerId(null)
    setVertices([])
    const id = await project.createFeature(layer.id, geometry, name)
    if (!id) return
    setOpenLayerId(layer.id)
    setSelectedId(id)
    setSheet(true)
    markReveal(id)
  }

  function fitShown() {
    const features = openLayer
      ? project.model.features.filter((feature) => feature.layerId === openLayer.id)
      : project.model.features.filter((feature) => shownIds.has(feature.layerId) && !hidden.has(feature.layerId))
    const box = featureBounds(features)
    if (box) mapRef.current?.fitBox(box)
  }

  function syncNow() {
    if (project.pending > 0) void project.flush()
    else void project.pull().catch(() => project.setFailed(true))
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

  async function markHere() {
    if (!openLayer || openLayer.geometryType !== "Point") return
    const coordinate = (await mapRef.current?.locate()) ?? null
    if (!coordinate) { setLocationOff(true); return }
    const count = project.model.features.filter((feature) => feature.layerId === openLayer.id).length
    await project.createPoint(openLayer.id, coordinate, t("markHere") + " " + (count + 1))
  }

  async function averageHere() {
    if (!openLayer || openLayer.geometryType !== "Point") return
    setFieldBusy(true)
    const fixes = await collectFixes()
    setFieldBusy(false)
    const result = averagePositions(fixes)
    if (!result) { setLocationOff(true); return }
    const count = project.model.features.filter((feature) => feature.layerId === openLayer.id).length
    await project.createPoint(openLayer.id, [result.coordinate[0], result.coordinate[1]], t("averageHere") + " " + (count + 1))
  }

  async function buildShape(kind: "LineString" | "Polygon") {
    if (!openLayer) return
    const points = project.model.features.filter((feature) => feature.layerId === openLayer.id && feature.geometry.type === "Point")
    if (kind === "LineString" && points.length < 2) return
    if (kind === "Polygon" && points.length < 3) return
    const coordinates = points.flatMap((feature) => feature.geometry.type === "Point" ? [feature.geometry.coordinates] : [])
    const id = await project.createPointLayer(`${openLayer.name} ${kind === "LineString" ? "line" : "area"}`, kind, openLayer.groupId)
    if (!id) return
    const geometry = kind === "LineString" ? { type: "LineString" as const, coordinates } : { type: "Polygon" as const, coordinates: [[...coordinates, coordinates[0]!]] }
    await project.createFeature(id, geometry, openLayer.name)
    setOpenLayerId(id)
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
  const zone = datum !== "web" && mapCenter ? zoneProfile(datum, mapCenter[0], mapCenter[1]) : null
  const activeProfile = zone && !zone.outside ? zone.profile : null
  const controlFit = (() => {
    if (project.controlPoints.length < 1) return null
    try {
      const solution = solveSimilarity(project.controlPoints.map((point) => ({ id: point.id, x: point.x, y: point.y, easting: point.easting, northing: point.northing, role: "fit" as const })))
      return { similarity: solution.similarity, rms: t("controlRms", { rms: solution.rmsM.toFixed(2) }) }
    } catch {
      return null
    }
  })()
  if (activeProfile) ensureProjection(activeProfile)
  const usable: DisplayDatum[] = ["web"]
  if (mapCenter) {
    for (const item of ["SK42", "SK95", "GSK2011"] as const) {
      const candidate = zoneProfile(item, mapCenter[0], mapCenter[1])
      if (candidate && !candidate.outside) usable.push(item)
    }
  }
  const rulerLabel = ruler.length >= 2 ? t("featureLength", { value: formatLength(geodesicLength(ruler)) }) : t("measureHint")
  const callout = selected && !placingLayerId && !measuring && !hidden.has(selected.layerId)
    ? { coordinate: anchorOf(selected.geometry), title: selected.name, layer: project.model.layers.find((layer) => layer.id === selected.layerId)?.name ?? "" }
    : null

  return (
    <div ref={stageRef} className={surface === "device" ? "map-phone relative h-full" : "relative h-full"}>
      <Legend layers={shownLayers} hidden={hidden} />
      {live.sharing ? <p role="status" className="absolute left-1/2 top-[max(8px,env(safe-area-inset-top))] z-20 -translate-x-1/2 rounded-full bg-neutral-900 px-3 py-1 text-xs text-white">{t("sharingLive")}</p> : null}
      <MapView
        ref={mapRef}
        features={project.model.features.filter((feature) => shownIds.has(feature.layerId) && !hidden.has(feature.layerId))}
        live={live.markers}
        selectedId={selectedId}
        placing={placingLayerId !== null || measuring || controlPick}
        callout={callout}
        draft={measuring && ruler.length > 0 ? { type: "LineString", coordinates: ruler } : placingLayer && placingLayer.geometryType !== "Point" && vertices.length > 0 ? { type: placingLayer.geometryType, coordinates: vertices } : null}
        projectionId={activeProfile?.id ?? null}
        onBasemapFailed={setBasemapFailed}
        onCenter={setMapCenter}
        onPlace={(coordinate) => {
          const rounded: [number, number] = [Number(coordinate[0].toFixed(6)), Number(coordinate[1].toFixed(6))]
          setCursor(rounded)
          if (controlPick) {
            setControlDraft(rounded)
            setControlPick(false)
            setSheet(true)
            return
          }
          if (measuring) {
            setRuler((current) => [...current, rounded])
            return
          }
          void placeAt(rounded)
        }}
        onCursor={setCursor}
        onLocated={setCursor}
        onSelect={(id) => { if (id) selectFeature(id); else setSelectedId(null) }}
        onGeometry={(id, geometry) => {
          const feature = project.model.features.find((item) => item.id === id)
          const layer = project.model.layers.find((item) => item.id === feature?.layerId)
          if (layer?.delivery) return
          project.updateGeometry(id, geometry)
        }}
      />
      {measuring ? (
        <MeasureBar label={rulerLabel} canUndo={ruler.length > 0} onUndo={() => setRuler((current) => current.slice(0, -1))} onClose={stopMeasure} />
      ) : null}
      {placingLayer ? (
        <PlacingBar
          name={placeName}
          onName={(name) => {
            placeNameTouched.current = true
            setPlaceName(name)
          }}
          layerId={placingLayer.id}
          layers={shownLayers.filter((layer) => layer.geometryType === placingLayer.geometryType && !layer.delivery)}
          onLayer={choosePlaceLayer}
          onClose={() => { setPlacingLayerId(null); setVertices([]) }}
          sketch={placingLayer.geometryType !== "Point"}
          canFinish={placingLayer.geometryType === "LineString" ? vertices.length >= 2 : vertices.length >= 3}
          onUndo={() => setVertices((current) => current.slice(0, -1))}
          onFinish={() => void finishShape()}
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
          title={outcome ? t("importData") : devicesOpen ? t("settings") : sendLayerId ? t("sendLayer") : controlsOpen ? t("controlPoints") : openLayer ? openLayer.name : t("layersTitle")}
          onClose={() => { if (outcome) { setOutcome(null); return }; if (devicesOpen) { setDevicesOpen(false); return }; if (sendLayerId) { setSendLayerId(null); return }; if (openLayerId) setOpenLayerId(null); else setSheet(false) }}
          onRename={!outcome && !devicesOpen && !sendLayerId && openLayer && !openLayer.delivery ? (name) => void project.renameLayer(openLayer.id, name) : undefined}
          actions={!outcome && !devicesOpen && !sendLayerId && openLayer ? (
            <LayerActions
              geometryType={openLayer.geometryType}
              color={openLayer.color}
              styleOpen={styleOpen}
              locked={openLayer.delivery != null}
              onStyle={() => setStyleOpen((open) => !open)}
              onAdd={beginAdd}
              onSend={surface === "main" && !openLayer.delivery ? () => { setSendLayerId(openLayer.id); setDevicesOpen(false); setControlsOpen(false) } : undefined}
              onExport={() => {
                const file = layerZip(openLayer.name, openLayer.geometryType, project.recordsIn(openLayer.id))
                void saveZip(file.filename, file.bytes)
              }}
              onDelete={() => void project.deleteLayer(openLayer.id).then((ok) => { if (!ok) return; if (openLayerId === openLayer.id) setOpenLayerId(null); setSelectedId(null) })}
            />
          ) : null}
          footer={<SyncActions lastSync={project.lastSync} onSync={syncNow} onFit={fitShown} fitLabel={t(openLayer ? "fitLayer" : "fitLayers")} canUndo={project.canUndo} canRedo={project.canRedo} onUndo={project.undo} onRedo={project.redo} onBack={onBack} onDisconnect={onDisconnect} />}
        >
          {devicesOpen && !outcome ? (
            <DevicesPanel
              session={session}
              surface={surface}
              sharing={live.sharing}
              onSharing={live.setSharing}
              people={live.people}
              onTogglePerson={live.togglePerson}
              onJoined={onJoined}
            />
          ) : sendLayerId && !outcome ? (
            <SendPanel session={session} onSend={async (audience) => {
              const ok = await project.sendLayer(sendLayerId, audience)
              if (ok) setSendLayerId(null)
              return ok
            }} />
          ) : controlsOpen && !outcome ? (
            <ControlPanel
              points={project.controlPoints}
              rms={controlFit?.rms ?? null}
              picking={controlPick}
              draft={controlDraft}
              canPlace={Boolean(openLayer && controlFit)}
              onPick={() => { setControlPick(true); setSheet(false) }}
              onSave={(x, y) => { if (!controlDraft) return; const [easting, northing] = groundOf(controlDraft, activeProfile); project.addControlPoint({ x, y, easting, northing }); setControlDraft(null) }}
              onCancel={() => setControlDraft(null)}
              onDelete={project.deleteControlPoint}
              onPlace={() => {
                if (!openLayer || !controlFit) return
                const updates = project.recordsIn(openLayer.id).map((feature) => {
                  const stored = feature.sourceGeometry?.coordinates
                  const local = stored && typeof stored === "object" && stored !== null && "type" in stored ? stored as typeof feature.geometry : feature.geometry
                  return { id: feature.id, geometry: seatGeometry(local, controlFit.similarity, activeProfile) }
                })
                project.seatFeatures(updates)
              }}
              onClose={() => { setControlsOpen(false); setControlPick(false); setControlDraft(null) }}
            />
          ) : outcome ? (
            <ImportBody
              outcome={outcome}
              onChoose={(name) => { const bytes = zipRef.current; if (bytes) setOutcome(loadBytes("archive.zip", bytes, { only: name })) }}
              onDecide={(options) => {
                const bytes = zipRef.current
                if (!bytes || outcome.kind !== "decide") return
                setOutcome(loadBytes("archive.zip", bytes, { only: outcome.name, ...options }))
              }}
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
          <>
          {openLayer && styleOpen ? (
            <LayerStyle
              color={openLayer.color}
              fillOpacity={openLayer.fillOpacity}
              geometryType={openLayer.geometryType}
              labelAttribute={openLayer.labelAttribute}
              fields={labelFields(project.recordsIn(openLayer.id))}
              onColor={(color) => project.restyleLayer(openLayer.id, { color })}
              onOpacity={(fillOpacity) => project.restyleLayer(openLayer.id, { fillOpacity })}
              onLabel={(labelAttribute) => project.restyleLayer(openLayer.id, { labelAttribute })}
            />
          ) : null}
          <LayerBrowser
            layers={shownLayers}
            groups={project.model.groups}
            features={project.model.features.filter((feature) => shownIds.has(feature.layerId))}
            openLayerId={openLayerId}
            selectedId={selectedId}
            onOpenLayer={setOpenLayerId}
            onSelectFeature={selectFeature}
            onRenameFeature={project.renameFeature}
            onDeleteFeature={(id) => { project.deleteFeature(id); setSelectedId(null) }}
            onCreateLayer={(name, geometryType, groupId) => void project.createPointLayer(name, geometryType, groupId).then((id) => {
              if (!id) return
              placeNameTouched.current = false
              const key = geometryType === "LineString" ? "defaultLineName" : geometryType === "Polygon" ? "defaultPolygonName" : "defaultPointName"
              setPlaceName(t(key, { n: 1 }))
              startPlacing(id)
            })}
            onCreateGroup={(name) => void project.createGroup(name)}
            onSetGroup={project.setLayerGroup}
            hidden={hidden}
            onToggleVisible={toggleHidden}
            onReorder={(groupId, from, to) => project.reorderLayers(groupedIds(shownLayers, project.model.groups, groupId, from, to))}
            onImport={() => fileRef.current?.click()}
            onControls={() => setControlsOpen(true)}
            locked={openLayer?.delivery != null}
            fieldBusy={fieldBusy}
            onMark={() => void markHere()}
            onAverage={() => void averageHere()}
            onBuildLine={() => void buildShape("LineString")}
            onBuildPolygon={() => void buildShape("Polygon")}
          />
          </>
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
        canCopy={selectedPoint !== null && placingLayerId === null}
        session={session}
        datum={datum}
        zone={activeProfile?.zone ?? null}
        profile={activeProfile}
        outside={datum !== "web" && mapCenter != null && activeProfile == null}
        usable={usable}
        onDatum={(next) => { setDatum(next); writeDisplayDatum(next) }}
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
        layersOpen={sheet && !placingLayerId && !devicesOpen}
        placing={placingLayerId !== null}
        measuring={measuring}
        locating={locating}
        settingsOpen={devicesOpen}
        disabled={project.loading || (surface !== "device" && project.failed)}
        onLayers={() => {
          setPlacingLayerId(null)
          stopMeasure()
          if (devicesOpen) {
            setDevicesOpen(false)
            setSheet(true)
            return
          }
          setSheet((current) => !current)
        }}
        onAdd={beginAdd}
        onMeasure={toggleMeasure}
        onLocate={() => void locate()}
        onSettings={() => {
          setPlacingLayerId(null)
          stopMeasure()
          setSendLayerId(null)
          setControlsOpen(false)
          setOpenLayerId(null)
          setOutcome(null)
          setDevicesOpen(true)
          setSheet(true)
        }}
      />
    </div>
  )
}
