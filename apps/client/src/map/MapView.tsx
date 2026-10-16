import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import Map from "ol/Map"
import View from "ol/View"
import Attribution from "ol/control/Attribution"
import Zoom from "ol/control/Zoom"
import GeoJSON from "ol/format/GeoJSON"
import Overlay from "ol/Overlay"
import TileLayer from "ol/layer/Tile"
import VectorLayer from "ol/layer/Vector"
import { fromLonLat, get as getProjection, transform } from "ol/proj"
import OSM from "ol/source/OSM"
import VectorSource from "ol/source/Vector"
import { t } from "../i18n/translate.js"
import type { MapFeature } from "../app/model.js"
import { DEV_BASEMAP_URL } from "./basemap.js"
import { FRAME_MARGIN, extentToScreen, frameFeature, panToCenterDelta } from "./frame.js"
import { HERE_ZOOM, hereStyle, placeHere, readPosition } from "./here.js"
import { featureStyle, paintFeature } from "./style.js"

export type MapCallout = { coordinate: [number, number]; title: string; layer: string }

export type MapHandle = {
  fit(): void
  show(id: string, padding: [number, number, number, number]): void
  locate(): Promise<[number, number] | null>
}

type MapViewProps = {
  features: readonly MapFeature[]
  selectedId?: string | null
  placing?: boolean
  callout?: MapCallout | null
  projectionId?: string | null
  draft?: { type: "LineString" | "Polygon"; coordinates: [number, number][] } | null
  onBasemapFailed: (failed: boolean) => void
  onCenter?: (coordinate: [number, number]) => void
  onSelect?: (featureId: string | null) => void
  onPlace?: (coordinate: [number, number]) => void
  onCursor?: (coordinate: [number, number]) => void
  onLocated?: (coordinate: [number, number]) => void
}

const format = new GeoJSON()
const HIT_TOLERANCE = 12

function fitSource(map: Map, source: VectorSource): void {
  const extent = source.getExtent()
  const size = map.getSize()
  if (!extent || !size || !extent.every((value) => Number.isFinite(value))) return
  map.getView().fit(extent, { padding: [80, 56, 120, 16], maxZoom: 16, size, duration: 0 })
}

/**
 * OpenLayers calls its geographic CRS EPSG:4326 and stores longitude first.
 * That matches OGC:CRS84. It is not the formal EPSG:4326 axis order.
 */
function lonLatFromView(map: Map, coordinate: number[]): [number, number] {
  const [longitude, latitude] = transform(coordinate, map.getView().getProjection(), "EPSG:4326")
  return [longitude, latitude]
}

function viewFromLonLat(map: Map, coordinate: [number, number]): number[] {
  return transform(coordinate, "EPSG:4326", map.getView().getProjection())
}

function toOlFeature(feature: MapFeature, selected: boolean, projection: string) {
  const read = format.readFeature(
    { type: "Feature", geometry: feature.geometry, properties: { name: feature.name } },
    { dataProjection: "EPSG:4326", featureProjection: projection },
  )
  const olFeature = Array.isArray(read) ? read[0] : read
  if (!olFeature) throw new Error("Could not read feature")
  paintFeature(olFeature, feature.color, feature.fillOpacity, feature.strokeWidth)
  olFeature.setId(feature.id)
  olFeature.set("selected", selected)
  olFeature.set("stack", feature.stack)
  return olFeature
}

function showFeature(map: Map, source: VectorSource, id: string, padding: [number, number, number, number]): void {
  const feature = source.getFeatureById(id)
  const geometry = feature?.getGeometry()
  const size = map.getSize()
  if (!geometry || !size || size[0] < 2 || size[1] < 2) return
  const view = map.getView()
  view.cancelAnimations()
  const center = view.getCenter()
  const resolution = view.getResolution()
  if (!center || resolution == null) return
  const raw = geometry.getExtent()
  if (!raw.every((value) => Number.isFinite(value))) return
  const extent = [raw[0], raw[1], raw[2], raw[3]] as [number, number, number, number]
  const screen = extentToScreen(extent, [center[0] ?? 0, center[1] ?? 0], resolution, [size[0], size[1]])
  const halo = geometry.getType() === "Point" ? 14 : 6
  const action = frameFeature(
    { left: screen.left - halo, top: screen.top - halo, right: screen.right + halo, bottom: screen.bottom + halo },
    { width: size[0], height: size[1] },
    padding,
  )
  if (action.kind === "clear") return
  if (action.kind === "pan") {
    const [shiftX, shiftY] = panToCenterDelta(action.dx, action.dy, resolution)
    view.animate({ center: [center[0] + shiftX, center[1] + shiftY], duration: 180 })
    return
  }
  const fitted: [number, number, number, number] = [
    padding[0] + FRAME_MARGIN,
    padding[1] + FRAME_MARGIN,
    padding[2] + FRAME_MARGIN,
    padding[3] + FRAME_MARGIN,
  ]
  if (fitted[0] + fitted[2] >= size[1] || fitted[1] + fitted[3] >= size[0]) return
  const zoom = view.getZoom()
  view.fit(extent, { padding: fitted, maxZoom: typeof zoom === "number" ? zoom : 16, duration: 180, size })
}

export const MapView = forwardRef<MapHandle, MapViewProps>(function MapView({ features, selectedId = null, placing = false, callout = null, projectionId = null, draft = null, onBasemapFailed, onSelect, onPlace, onCursor, onLocated, onCenter }, ref) {
  const target = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const sourceRef = useRef<VectorSource | null>(null)
  const hereRef = useRef<VectorSource | null>(null)
  const calloutOverlay = useRef<Overlay | null>(null)
  const calloutElement = useRef<HTMLDivElement | null>(null)
  const selectRef = useRef(onSelect)
  const placeRef = useRef(onPlace)
  const cursorRef = useRef(onCursor)
  const locatedRef = useRef(onLocated)
  const centerRef = useRef(onCenter)
  const placingRef = useRef(placing)
  const didFit = useRef(false)
  const hasHere = useRef(false)
  const hereLonLat = useRef<[number, number] | null>(null)
  const [rotation, setRotation] = useState(0)
  selectRef.current = onSelect
  placeRef.current = onPlace
  cursorRef.current = onCursor
  locatedRef.current = onLocated
  centerRef.current = onCenter
  placingRef.current = placing

  useLayoutEffect(() => {
    const element = target.current
    if (!element) return
    const tiles = new OSM({ url: DEV_BASEMAP_URL, attributions: "© OpenStreetMap contributors", crossOrigin: "anonymous" })
    const vectors = new VectorSource()
    const here = new VectorSource()
    const hereLayer = new VectorLayer({ source: here, style: hereStyle() })
    hereLayer.set("kind", "here")
    const bubble = document.createElement("div")
    bubble.className = "map-callout"
    const bubbleOverlay = new Overlay({ element: bubble, positioning: "bottom-center", offset: [0, -14], stopEvent: false })
    const map = new Map({
      target: element,
      controls: [new Zoom(), new Attribution({ collapsible: false })],
      layers: [new TileLayer({ source: tiles }), new VectorLayer({ source: vectors, style: featureStyle }), hereLayer],
      view: new View({ center: fromLonLat([-0.166, 51.507]), zoom: 13 }),
    })
    map.addOverlay(bubbleOverlay)
    let failed = false
    let errors = 0
    const onError = () => {
      errors += 1
      if (errors < 2 || failed) return
      failed = true
      onBasemapFailed(true)
    }
    const onLoad = () => {
      if (!failed) return
      failed = false
      errors = 0
      onBasemapFailed(false)
    }
    tiles.on("tileloaderror", onError)
    tiles.on("tileloadend", onLoad)
    mapRef.current = map
    sourceRef.current = vectors
    hereRef.current = here
    calloutOverlay.current = bubbleOverlay
    calloutElement.current = bubble
    const onClick = (event: { pixel: number[]; coordinate?: number[] }) => {
      if (event.coordinate) {
        const picked = lonLatFromView(map, event.coordinate)
        cursorRef.current?.(picked)
        if (placingRef.current) {
          placeRef.current?.(picked)
          return
        }
      }
      let found: string | null = null
      map.forEachFeatureAtPixel(event.pixel, (feature) => {
        const id = feature.getId()
        if (typeof id !== "string") return undefined
        found = id
        return id
      }, { hitTolerance: HIT_TOLERANCE, layerFilter: (layer) => layer.get("kind") !== "here" })
      selectRef.current?.(found)
    }
    map.on("singleclick", onClick)
    const onRotate = () => setRotation(map.getView().getRotation())
    map.getView().on("change:rotation", onRotate)
    const onMove = () => {
      const center = map.getView().getCenter()
      if (!center) return
      centerRef.current?.(lonLatFromView(map, center))
    }
    map.on("moveend", onMove)
    onMove()
    void readPosition()
      .then((coordinate) => {
        if (mapRef.current !== map) return
        hasHere.current = true
        hereLonLat.current = coordinate
        placeHere(here, viewFromLonLat(map, coordinate))
        const view = map.getView()
        view.setCenter(viewFromLonLat(map, coordinate))
        if (view.getProjection().getCode() === "EPSG:3857") view.setZoom(HERE_ZOOM)
        else view.setResolution(2)
        locatedRef.current?.(coordinate)
      })
      .catch(() => {})
    return () => {
      map.un("singleclick", onClick)
      map.un("moveend", onMove)
      map.getView().un("change:rotation", onRotate)
      tiles.un("tileloaderror", onError)
      tiles.un("tileloadend", onLoad)
      map.setTarget(undefined)
      mapRef.current = null
      sourceRef.current = null
      hereRef.current = null
      calloutOverlay.current = null
      calloutElement.current = null
      didFit.current = false
    }
  }, [onBasemapFailed])

  useLayoutEffect(() => {
    const map = mapRef.current
    if (!map) return
    const next = projectionId ?? "EPSG:3857"
    const view = map.getView()
    if (view.getProjection().getCode() === next) return
    const center = view.getCenter()
    if (!center) return
    const geographic = lonLatFromView(map, center)
    const moved = transform(geographic, "EPSG:4326", next)
    const rotationNow = view.getRotation()
    const resolution = view.getResolution()
    map.setView(new View({
      projection: next,
      center: moved,
      resolution,
      rotation: rotationNow,
      extent: next === "EPSG:3857" ? undefined : getProjection(next)?.getExtent(),
    }))
    const fix = hereLonLat.current
    const here = hereRef.current
    if (fix && here) placeHere(here, transform(fix, "EPSG:4326", next))
    const onRotateNow = () => setRotation(map.getView().getRotation())
    map.getView().on("change:rotation", onRotateNow)
    setRotation(map.getView().getRotation())
    return () => map.getView().un("change:rotation", onRotateNow)
  }, [projectionId])

  useLayoutEffect(() => {
    const map = mapRef.current
    const source = sourceRef.current
    if (!map || !source) return
    const projection = map.getView().getProjection().getCode()
    source.clear()
    source.addFeatures(features.map((feature) => toOlFeature(feature, feature.id === selectedId, projection)))
    if (draft && draft.coordinates.length > 0) {
      const geometry = draft.coordinates.length === 1
        ? { type: "Point" as const, coordinates: draft.coordinates[0]! }
        : draft.type === "Polygon" && draft.coordinates.length >= 3
          ? { type: "Polygon" as const, coordinates: [[...draft.coordinates, draft.coordinates[0]!]] }
          : { type: "LineString" as const, coordinates: draft.coordinates }
      const sketch = toOlFeature({ id: "draft", name: "", layerId: "", geometry, color: "#2563eb", fillOpacity: 0.15, strokeWidth: 2, stack: 200000 }, false, projection)
      sketch.setId(undefined)
      sketch.set("draft", true)
      source.addFeature(sketch)
    }
    if (!didFit.current && features.length > 0 && !hasHere.current) {
      fitSource(map, source)
      didFit.current = true
    }
  }, [features, selectedId, projectionId, draft])

  useLayoutEffect(() => {
    const overlay = calloutOverlay.current
    const element = calloutElement.current
    if (!overlay || !element) return
    if (!callout) {
      overlay.setPosition(undefined)
      return
    }
    element.replaceChildren()
    const title = document.createElement("strong")
    title.textContent = callout.title
    const layer = document.createElement("span")
    layer.textContent = callout.layer
    element.append(title, layer)
    const map = mapRef.current
    if (!map) return
    overlay.setPosition(viewFromLonLat(map, callout.coordinate))
  }, [callout, projectionId])

  useImperativeHandle(ref, () => ({
    fit() {
      const map = mapRef.current
      const source = sourceRef.current
      if (!map || !source) return
      fitSource(map, source)
    },
    show(id: string, padding: [number, number, number, number]) {
      const map = mapRef.current
      const source = sourceRef.current
      if (!map || !source) return
      showFeature(map, source, id, padding)
    },
    async locate() {
      const map = mapRef.current
      const here = hereRef.current
      if (!map || !here) return null
      try {
        const coordinate = await readPosition()
        hasHere.current = true
        hereLonLat.current = coordinate
        placeHere(here, viewFromLonLat(map, coordinate))
        map.getView().cancelAnimations()
        const view = map.getView()
        if (view.getProjection().getCode() === "EPSG:3857") view.animate({ center: viewFromLonLat(map, coordinate), zoom: HERE_ZOOM, duration: 250 })
        else view.animate({ center: viewFromLonLat(map, coordinate), resolution: 2, duration: 250 })
        return coordinate
      } catch {
        return null
      }
    },
  }), [])

  return (
    <div className="relative h-full w-full">
      <div ref={target} className={placing ? "map-root map-placing" : "map-root"} aria-label={t("mapLabel")} />
      <button type="button" className="map-north" aria-label={t("north")} title={t("north")} onClick={() => mapRef.current?.getView().animate({ rotation: 0, duration: 200 })}>
        <span className="map-north-arrow" style={{ transform: `rotate(${-rotation}rad)` }}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 3 16 14 12 12 8 14Z" fill="#dc2626" />
            <path d="M12 21 8 10 12 12 16 10Z" fill="#111827" />
          </svg>
        </span>
      </button>
    </div>
  )
})
