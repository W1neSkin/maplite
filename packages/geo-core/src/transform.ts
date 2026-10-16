import proj4 from "proj4"
import {
  defaultOperationFor,
  ellipsoidOf,
  geographicDefinition,
  operationById,
  profileById,
  projectionOnlyDefinition,
} from "./catalog.js"
import { geographicToWgs84, wgs84ToGeographic } from "./helmert.js"
import { GeoError, type Crs84Coordinate, type CrsProfile, type CoordinateOperation, type EastingNotation, type ProjectedCoordinate, type TransformResult } from "./types.js"

function requireProfile(id: string): CrsProfile {
  const profile = profileById(id)
  if (!profile) throw new GeoError("unknown_crs", `Unknown CRS profile ${id}`)
  return profile
}

function requireOperation(profile: CrsProfile, operation?: CoordinateOperation): CoordinateOperation {
  if (operation) return operation
  const found = operationById(profile.operationId) ?? defaultOperationFor(profile.datum)
  return found
}

function insideLongitude(longitude: number, west: number, east: number): boolean {
  if (west <= east) return longitude >= west && longitude <= east
  return longitude >= west || longitude <= east
}

export function outsideArea(longitude: number, latitude: number, profile: CrsProfile): boolean {
  if (latitude < profile.area.south || latitude > profile.area.north) return true
  return !insideLongitude(longitude, profile.area.west, profile.area.east)
}

function toFullEasting(easting: number, zone: number, notation: EastingNotation): number {
  return notation === "truncated" ? easting + zone * 1_000_000 : easting
}

function fromFullEasting(easting: number, zone: number, notation: EastingNotation): number {
  return notation === "truncated" ? easting - zone * 1_000_000 : easting
}

/** EPSG projected axis order is northing, easting. The library uses easting, northing. */
export function fromEpsgAxisOrder(northing: number, easting: number): ProjectedCoordinate {
  return [easting, northing]
}

export function toEpsgAxisOrder(coordinate: ProjectedCoordinate): readonly [northing: number, easting: number] {
  return [coordinate[1], coordinate[0]]
}

function inverseProjection(profile: CrsProfile, easting: number, northing: number): { longitudeDeg: number; latitudeDeg: number } {
  const projected = projectionOnlyDefinition(profile)
  const geographic = geographicDefinition(profile)
  // proj4's inverse transverse Mercator drifts by a few decimetres at the
  // edge of a 6° zone. Refine it so the forward projection of the result
  // matches the given easting and northing.
  let [longitude, latitude] = proj4(projected, geographic, [easting, northing]) as [number, number]
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [east, north] = proj4(geographic, projected, [longitude, latitude]) as [number, number]
    const deltaEast = easting - east
    const deltaNorth = northing - north
    if (Math.hypot(deltaEast, deltaNorth) < 1e-4) break
    const step = 1e-7
    const [eastLon, northLon] = proj4(geographic, projected, [longitude + step, latitude]) as [number, number]
    const [eastLat, northLat] = proj4(geographic, projected, [longitude, latitude + step]) as [number, number]
    const deLon = (eastLon - east) / step
    const dnLon = (northLon - north) / step
    const deLat = (eastLat - east) / step
    const dnLat = (northLat - north) / step
    const determinant = deLon * dnLat - deLat * dnLon
    if (Math.abs(determinant) < 1e-12) break
    longitude += (deltaEast * dnLat - deltaNorth * deLat) / determinant
    latitude += (deltaNorth * deLon - deltaEast * dnLon) / determinant
  }
  return { longitudeDeg: longitude, latitudeDeg: latitude }
}

function forwardProjection(profile: CrsProfile, longitudeDeg: number, latitudeDeg: number): ProjectedCoordinate {
  const [easting, northing] = proj4(geographicDefinition(profile), projectionOnlyDefinition(profile), [longitudeDeg, latitudeDeg])
  return [easting, northing]
}

export function projectedToCrs84(
  coordinate: ProjectedCoordinate,
  profileOrId: CrsProfile | string,
  options?: { operation?: CoordinateOperation; notation?: EastingNotation },
): TransformResult {
  const profile = typeof profileOrId === "string" ? requireProfile(profileOrId) : profileOrId
  const operation = requireOperation(profile, options?.operation)
  const notation = options?.notation ?? "full"
  const easting = toFullEasting(coordinate[0], profile.zone, notation)
  const source = inverseProjection(profile, easting, coordinate[1])
  const wgs = geographicToWgs84(source.longitudeDeg, source.latitudeDeg, ellipsoidOf(operation), operation.helmert)
  return {
    coordinate: [wgs.longitudeDeg, wgs.latitudeDeg],
    outsideAreaOfUse: outsideArea(wgs.longitudeDeg, wgs.latitudeDeg, profile),
  }
}

export function crs84ToProjected(
  coordinate: Crs84Coordinate,
  profileOrId: CrsProfile | string,
  options?: { operation?: CoordinateOperation; notation?: EastingNotation },
): { coordinate: ProjectedCoordinate; outsideAreaOfUse: boolean } {
  const profile = typeof profileOrId === "string" ? requireProfile(profileOrId) : profileOrId
  const operation = requireOperation(profile, options?.operation)
  const notation = options?.notation ?? "full"
  const source = wgs84ToGeographic(coordinate[0], coordinate[1], ellipsoidOf(operation), operation.helmert)
  const projected = forwardProjection(profile, source.longitudeDeg, source.latitudeDeg)
  return {
    coordinate: [fromFullEasting(projected[0], profile.zone, notation), projected[1]],
    outsideAreaOfUse: outsideArea(coordinate[0], coordinate[1], profile),
  }
}

export function sourceGeographicToCrs84(
  longitudeDeg: number,
  latitudeDeg: number,
  operation: CoordinateOperation,
): Crs84Coordinate {
  const wgs = geographicToWgs84(longitudeDeg, latitudeDeg, ellipsoidOf(operation), operation.helmert)
  return [wgs.longitudeDeg, wgs.latitudeDeg]
}

export function crs84ToWebMercator(coordinate: Crs84Coordinate): ProjectedCoordinate {
  const [x, y] = proj4("EPSG:4326", "EPSG:3857", [coordinate[0], coordinate[1]])
  return [x, y]
}

export function webMercatorToCrs84(coordinate: ProjectedCoordinate): Crs84Coordinate {
  const [longitude, latitude] = proj4("EPSG:3857", "EPSG:4326", [coordinate[0], coordinate[1]])
  return [longitude, latitude]
}
