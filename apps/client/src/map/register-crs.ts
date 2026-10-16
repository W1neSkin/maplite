import type { CrsProfile } from "@cartography/geo-core"
import { crs84ToProjected, projectedToCrs84 } from "@cartography/geo-core"
import { addCoordinateTransforms, addProjection, Projection } from "ol/proj"

const ready = new Set<string>()

/** Register one Gauss-Kruger zone. Transforms go through longitude and latitude. */
export function ensureProjection(profile: CrsProfile): string {
  if (ready.has(profile.id)) return profile.id
  const half = 250_000
  const extent = [profile.falseEasting - half, 4_000_000, profile.falseEasting + half, 9_500_000]
  addProjection(new Projection({ code: profile.id, units: "m", extent }))
  addCoordinateTransforms(
    "EPSG:4326",
    profile.id,
    (coordinate) => {
      const projected = crs84ToProjected([coordinate[0] ?? 0, coordinate[1] ?? 0], profile).coordinate
      return [projected[0], projected[1]]
    },
    (coordinate) => {
      const geographic = projectedToCrs84([coordinate[0] ?? 0, coordinate[1] ?? 0], profile).coordinate
      return [geographic[0], geographic[1]]
    },
  )
  ready.add(profile.id)
  return profile.id
}
