import type { MapFeature } from "../app/model.js"

function pairsOf(geometry: MapFeature["geometry"]): [number, number][] {
  if (geometry.type === "Point") return [geometry.coordinates]
  if (geometry.type === "LineString") return geometry.coordinates
  return geometry.coordinates.flat()
}

/** Longitude/latitude box around the features. A single point is a zero-size box. */
export function featureBounds(features: readonly MapFeature[]): [number, number, number, number] | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  let count = 0
  for (const feature of features) {
    for (const [longitude, latitude] of pairsOf(feature.geometry)) {
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
      west = Math.min(west, longitude)
      east = Math.max(east, longitude)
      south = Math.min(south, latitude)
      north = Math.max(north, latitude)
      count += 1
    }
  }
  return count > 0 ? [west, south, east, north] : null
}
