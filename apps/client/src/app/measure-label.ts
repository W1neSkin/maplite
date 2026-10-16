import { measureLine, measurePolygon } from "@cartography/geo-core"
import { formatArea, formatLength } from "../i18n/format.js"
import { t } from "../i18n/translate.js"
import type { MapFeature } from "./model.js"

/** Geodesic length, or perimeter and area. A crossed outline does not get an ordinary area. */
export function measureLabel(geometry: MapFeature["geometry"]): string | null {
  if (geometry.type === "Point") return null
  if (geometry.type === "LineString") {
    const measured = measureLine(geometry.coordinates)
    return t("featureLength", { value: formatLength(measured.lengthM) })
  }
  const [outer, ...holes] = geometry.coordinates
  if (!outer) return null
  const measured = measurePolygon(outer, holes)
  const perimeter = formatLength(measured.perimeterM ?? measured.lengthM)
  if (measured.selfIntersecting || measured.areaM2 == null) return t("featureOutline", { perimeter })
  return t("featureSize", { perimeter, area: formatArea(measured.areaM2) })
}
