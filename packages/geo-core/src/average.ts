import geographiclib from "geographiclib-geodesic"
import type { Crs84Coordinate } from "./types.js"

const geodesic = geographiclib.Geodesic.WGS84

export type AverageFix = {
  readonly id: string
  readonly coordinate: Crs84Coordinate
  readonly sampledAtMs: number
  readonly precise: boolean
  readonly horizontalAccuracyM: number | null
}

export type AverageResult = {
  readonly coordinate: Crs84Coordinate
  readonly count: number
  readonly durationMs: number
  readonly medianReportedAccuracyM: number | null
  readonly rmsScatterM: number
  readonly rejected: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2
  return sorted[mid]!
}

function enu(origin: Crs84Coordinate, point: Crs84Coordinate): { east: number; north: number } {
  const inverse = geodesic.Inverse(origin[1], origin[0], point[1], point[0])
  // The library types these as optional. A normal inverse always returns them.
  const azimuth = ((inverse.azi1 ?? 0) * Math.PI) / 180
  const distance = inverse.s12 ?? 0
  return { east: distance * Math.sin(azimuth), north: distance * Math.cos(azimuth) }
}

function fromEnu(origin: Crs84Coordinate, east: number, north: number): Crs84Coordinate {
  const distance = Math.hypot(east, north)
  if (distance < 1e-6) return origin
  const azimuth = (Math.atan2(east, north) * 180) / Math.PI
  const direct = geodesic.Direct(origin[1], origin[0], azimuth, distance)
  return [direct.lon2 ?? origin[0], direct.lat2 ?? origin[1]]
}

/**
 * Deterministic average. Stale and coarse fixes are dropped first. Outliers use
 * a modified Z-score on the horizontal distance from the median, with MAD floored
 * at 1 cm so a perfect cluster is not emptied by division by zero.
 */
export function averagePositions(
  fixes: readonly AverageFix[],
  options?: { nowMs?: number; maxAgeMs?: number },
): AverageResult | null {
  const now = options?.nowMs ?? Math.max(...fixes.map((fix) => fix.sampledAtMs))
  const maxAge = options?.maxAgeMs ?? 30_000
  const seen = new Set<string>()
  const fresh = fixes.filter((fix) => {
    if (seen.has(fix.id) || !fix.precise) return false
    if (now - fix.sampledAtMs > maxAge) return false
    seen.add(fix.id)
    return true
  })
  if (fresh.length === 0) return null
  const origin = fresh[0]!.coordinate
  const offsets = fresh.map((fix) => ({ fix, ...enu(origin, fix.coordinate) }))
  const distances = offsets.map((offset) => Math.hypot(offset.east, offset.north))
  const med = median(distances)
  const mad = median(distances.map((distance) => Math.abs(distance - med)))
  const scale = Math.max(1.4826 * mad, 0.01)
  const kept = offsets.filter((offset) => Math.abs(Math.hypot(offset.east, offset.north) - med) / scale <= 3.5)
  if (kept.length === 0) return null
  let eastSum = 0
  let northSum = 0
  let weightSum = 0
  for (const offset of kept) {
    const accuracy = Math.max(offset.fix.horizontalAccuracyM ?? 10, 0.5)
    const weight = 1 / (accuracy * accuracy)
    eastSum += offset.east * weight
    northSum += offset.north * weight
    weightSum += weight
  }
  const east = eastSum / weightSum
  const north = northSum / weightSum
  let scatter = 0
  for (const offset of kept) {
    scatter += (offset.east - east) ** 2 + (offset.north - north) ** 2
  }
  const accuracies = kept
    .map((offset) => offset.fix.horizontalAccuracyM)
    .filter((value): value is number => value != null)
  const times = kept.map((offset) => offset.fix.sampledAtMs)
  return {
    coordinate: fromEnu(origin, east, north),
    count: kept.length,
    durationMs: Math.max(...times) - Math.min(...times),
    medianReportedAccuracyM: accuracies.length ? median(accuracies) : null,
    rmsScatterM: Math.sqrt(scatter / kept.length),
    rejected: fresh.length - kept.length,
  }
}
