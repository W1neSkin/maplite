import geographiclib from "geographiclib-geodesic"
import type { Crs84Coordinate } from "./types.js"

const geodesic = geographiclib.Geodesic.WGS84
const PolygonArea = geographiclib.PolygonArea.PolygonArea

export type Ring = readonly Crs84Coordinate[]

export type MeasureResult = {
  readonly lengthM: number
  readonly perimeterM: number | null
  readonly areaM2: number | null
  readonly selfIntersecting: boolean
}

function segmentIntersect(
  a1: Crs84Coordinate,
  a2: Crs84Coordinate,
  b1: Crs84Coordinate,
  b2: Crs84Coordinate,
): boolean {
  const cross = (p: Crs84Coordinate, q: Crs84Coordinate, r: Crs84Coordinate) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = cross(b1, b2, a1)
  const d2 = cross(b1, b2, a2)
  const d3 = cross(a1, a2, b1)
  const d4 = cross(a1, a2, b2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

export function ringSelfIntersects(ring: Ring): boolean {
  const closed = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
  const vertices = closed ? ring.slice(0, -1) : [...ring]
  const count = vertices.length
  if (count < 4) return false
  for (let i = 0; i < count; i += 1) {
    const a1 = vertices[i]!
    const a2 = vertices[(i + 1) % count]!
    for (let j = i + 1; j < count; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === count - 1)) continue
      const b1 = vertices[j]!
      const b2 = vertices[(j + 1) % count]!
      if (segmentIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

export function geodesicLength(coordinates: readonly Crs84Coordinate[]): number {
  let length = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1]!
    const current = coordinates[index]!
    const inverse = geodesic.Inverse(previous[1], previous[0], current[1], current[0])
    length += inverse.s12 ?? 0
  }
  return length
}

function ringArea(ring: Ring): { areaM2: number; perimeterM: number } {
  const polygon = new PolygonArea(geodesic, false)
  for (const [longitude, latitude] of ring) polygon.AddPoint(latitude, longitude)
  const closed =
    ring.length > 1 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
  const result = polygon.Compute(!closed, true)
  return { areaM2: Math.abs(result.area ?? 0), perimeterM: result.perimeter ?? 0 }
}

export function measureLine(coordinates: readonly Crs84Coordinate[]): MeasureResult {
  return {
    lengthM: geodesicLength(coordinates),
    perimeterM: null,
    areaM2: null,
    selfIntersecting: false,
  }
}

export function measurePolygon(outer: Ring, holes: readonly Ring[] = []): MeasureResult {
  const selfIntersecting = ringSelfIntersects(outer) || holes.some(ringSelfIntersects)
  const outerMeasure = ringArea(outer)
  let area = outerMeasure.areaM2
  let perimeter = outerMeasure.perimeterM
  for (const hole of holes) {
    const measured = ringArea(hole)
    area -= measured.areaM2
    perimeter += measured.perimeterM
  }
  return {
    lengthM: perimeter,
    perimeterM: perimeter,
    areaM2: selfIntersecting || area < 0 ? null : area,
    selfIntersecting,
  }
}
