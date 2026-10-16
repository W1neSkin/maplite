import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react"
import Map from "ol/Map"
import View from "ol/View"
import Attribution from "ol/control/Attribution"
import Zoom from "ol/control/Zoom"
import GeoJSON from "ol/format/GeoJSON"
import Overlay from "ol/Overlay"
import TileLayer from "ol/layer/Tile"
import VectorLayer from "ol/layer/Vector"
import { fromLonLat, toLonLat } from "ol/proj"
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
  onBasemapFailed: (failed: boolean) => void
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
function toOlFeature(feature: MapFeature, selected: boolean) {
  const read = format.readFeature(
    { type: "Feature", geometry: feature.geometry, properties: { name: feature.name } },
    { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" },
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

export const MapView = forwardRef<MapHandle, MapViewProps>(function MapView({ features, selectedId = null, placing = false, callout = null, onBasemapFailed, onSelect, onPlace, onCursor, onLocated }, ref) {
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
  const placingRef = useRef(placing)
  const didFit = useRef(false)
  const hasHere = useRef(false)
  selectRef.current = onSelect
  placeRef.current = onPlace
  cursorRef.current = onCursor
  locatedRef.current = onLocated
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
        const [longitude, latitude] = toLonLat(event.coordinate)
        const picked: [number, number] = [longitude, latitude]
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
    void readPosition()
      .then((coordinate) => {
        if (mapRef.current !== map) return
        hasHere.current = true
        placeHere(here, coordinate)
        map.getView().setCenter(fromLonLat(coordinate))
        map.getView().setZoom(HERE_ZOOM)
        locatedRef.current?.(coordinate)
      })
      .catch(() => {})
    return () => {
      map.un("singleclick", onClick)
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
    const source = sourceRef.current
    if (!map || !source) return
    source.clear()
    source.addFeatures(features.map((feature) => toOlFeature(feature, feature.id === selectedId)))
    if (!didFit.current && features.length > 0 && !hasHere.current) {
      fitSource(map, source)
      didFit.current = true
    }
  }, [features, selectedId])

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
    overlay.setPosition(fromLonLat(callout.coordinate))
  }, [callout])

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
        placeHere(here, coordinate)
        map.getView().cancelAnimations()
        map.getView().animate({ center: fromLonLat(coordinate), zoom: HERE_ZOOM, duration: 250 })
        return coordinate
      } catch {
        return null
      }
    },
  }), [])

  return <div ref={target} className={placing ? "map-root map-placing" : "map-root"} aria-label={t("mapLabel")} />
})
