import { applySimilarity, crs84ToProjected, projectedToCrs84, type CrsProfile, type Similarity } from "@cartography/geo-core"
import { fromLonLat, toLonLat } from "ol/proj"
import type { Feature } from "@cartography/project-schema"

type Geometry = Feature["geometry"]

/** Map tap to the metres the similarity is solved in. A Gauss-Kruger view uses that zone. */
export function groundOf(coordinate: [number, number], profile: CrsProfile | null): [number, number] {
  if (profile) {
    const projected = crs84ToProjected(coordinate, profile, { notation: "full" }).coordinate
    return [projected[0], projected[1]]
  }
  const [x, y] = fromLonLat(coordinate)
  return [x ?? 0, y ?? 0]
}

function back(easting: number, northing: number, profile: CrsProfile | null): [number, number] {
  if (profile) {
    const geographic = projectedToCrs84([easting, northing], profile, { notation: "full" }).coordinate
    return [geographic[0], geographic[1]]
  }
  const [lon, lat] = toLonLat([easting, northing])
  return [lon ?? 0, lat ?? 0]
}

function pair(x: number, y: number, similarity: Similarity, profile: CrsProfile | null): [number, number] {
  const [easting, northing] = applySimilarity(x, y, similarity)
  const [lon, lat] = back(easting, northing, profile)
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))]
}

/** Treat stored numbers as local X Y and write them back as longitude and latitude. */
export function seatGeometry(geometry: Geometry, similarity: Similarity, profile: CrsProfile | null): Geometry {
  if (geometry.type === "Point") {
    const [x, y] = geometry.coordinates
    return { type: "Point", coordinates: pair(x, y, similarity, profile) }
  }
  if (geometry.type === "LineString") {
    return { type: "LineString", coordinates: geometry.coordinates.map(([x, y]) => pair(x, y, similarity, profile)) }
  }
  return {
    type: "Polygon",
    coordinates: geometry.coordinates.map((ring) => ring.map(([x, y]) => pair(x, y, similarity, profile))),
  }
}
