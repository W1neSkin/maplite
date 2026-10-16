import Collection from "ol/Collection"
import type Feature from "ol/Feature"
import GeoJSON from "ol/format/GeoJSON"
import Modify from "ol/interaction/Modify"
import type Map from "ol/Map"
import Circle from "ol/style/Circle"
import Fill from "ol/style/Fill"
import Stroke from "ol/style/Stroke"
import Style from "ol/style/Style"
import type { MapFeature } from "../app/model.js"

const format = new GeoJSON()

type EditedGeometry = MapFeature["geometry"]

function pair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const longitude = Number(value[0])
  const latitude = Number(value[1])
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))]
}

function ring(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) return null
  const points = value.map(pair).filter((item): item is [number, number] => item !== null)
  if (points.length < 3) return null
  const first = points[0]!
  const last = points[points.length - 1]!
  const closed = first[0] === last[0] && first[1] === last[1]
  if (closed) return points.length >= 4 ? points : null
  points.push(first)
  return points
}

/** Keep a dragged shape only when it is still a point, a line, or a closed ring. */
export function acceptedGeometry(value: unknown): EditedGeometry | null {
  if (!value || typeof value !== "object") return null
  const geometry = value as { type?: string; coordinates?: unknown }
  if (geometry.type === "Point") {
    const point = pair(geometry.coordinates)
    return point ? { type: "Point", coordinates: point } : null
  }
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    const line = geometry.coordinates.map(pair).filter((item): item is [number, number] => item !== null)
    return line.length >= 2 ? { type: "LineString", coordinates: line } : null
  }
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const rings = geometry.coordinates.map(ring).filter((item): item is [number, number][] => item !== null)
    return rings.length > 0 ? { type: "Polygon", coordinates: rings } : null
  }
  return null
}

function handleStyle(): Style {
  return new Style({
    image: new Circle({
      radius: 7,
      fill: new Fill({ color: "#ffffff" }),
      stroke: new Stroke({ color: "#2563eb", width: 2 }),
    }),
    stroke: new Stroke({ color: "#2563eb", width: 2 }),
    fill: new Fill({ color: "rgba(37, 99, 235, 0.12)" }),
  })
}

/**
 * Vertex handles for the selected feature.
 * A finger cannot alt-click, so a vertex is never deleted here: that would collapse the shape.
 */
export function attachVertexEdit(map: Map, feature: Feature, projection: string, onEnd: (geometry: EditedGeometry) => void): () => void {
  const modify = new Modify({
    features: new Collection([feature]),
    pixelTolerance: 18,
    deleteCondition: () => false,
    style: handleStyle,
  })
  const onModifyEnd = () => {
    const geometry = feature.getGeometry()
    if (!geometry) return
    const written = format.writeGeometryObject(geometry, { featureProjection: projection, dataProjection: "EPSG:4326" })
    const accepted = acceptedGeometry(written)
    if (accepted) onEnd(accepted)
  }
  modify.on("modifyend", onModifyEnd)
  map.addInteraction(modify)
  return () => {
    modify.un("modifyend", onModifyEnd)
    map.removeInteraction(modify)
  }
}
