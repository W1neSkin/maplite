import type { Feature } from "@cartography/project-schema"

/** A point uses its own coordinate. A line or polygon uses the middle of its box. */
export function anchorOf(geometry: Feature["geometry"]): [number, number] {
  if (geometry.type === "Point") return geometry.coordinates
  const coords = geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates[0]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of coords) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  if (!Number.isFinite(minX)) return [0, 0]
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}
