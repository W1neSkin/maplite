import type { CrsProfile } from "@cartography/geo-core"
import { crs84ToProjected, crs84ToWebMercator, projectedToCrs84, webMercatorToCrs84 } from "@cartography/geo-core"
import { addCoordinateTransforms, addProjection, Projection } from "ol/proj"

const ready = new Set<string>()

/** Register one Gauss-Kruger zone. Transforms go through longitude and latitude. */
export function ensureProjection(profile: CrsProfile): string {
  if (ready.has(profile.id)) return profile.id
  const half = 250_000
  const extent = [profile.falseEasting - half, 4_000_000, profile.falseEasting + half, 9_500_000]
  addProjection(new Projection({ code: profile.id, units: "m", extent }))
  const toZone = (longitude: number, latitude: number): number[] => {
    const projected = crs84ToProjected([longitude, latitude], profile).coordinate
    return [projected[0], projected[1]]
  }
  const toGeographic = (easting: number, northing: number): number[] => {
    const geographic = projectedToCrs84([easting, northing], profile).coordinate
    return [geographic[0], geographic[1]]
  }
  addCoordinateTransforms(
    "EPSG:4326",
    profile.id,
    (coordinate) => toZone(coordinate[0] ?? 0, coordinate[1] ?? 0),
    (coordinate) => toGeographic(coordinate[0] ?? 0, coordinate[1] ?? 0),
  )
  // Tile basemaps are Web Mercator. OpenLayers does not chain that through longitude itself.
  addCoordinateTransforms(
    "EPSG:3857",
    profile.id,
    (coordinate) => {
      const geographic = webMercatorToCrs84([coordinate[0] ?? 0, coordinate[1] ?? 0])
      return toZone(geographic[0], geographic[1])
    },
    (coordinate) => {
      const geographic = toGeographic(coordinate[0] ?? 0, coordinate[1] ?? 0)
      const mercator = crs84ToWebMercator([geographic[0] ?? 0, geographic[1] ?? 0])
      return [mercator[0], mercator[1]]
    },
  )
  ready.add(profile.id)
  return profile.id
}
