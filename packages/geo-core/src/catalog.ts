import { GSK2011, KRASSOVSKY } from "./ellipsoids.js"
import type { BBox, CoordinateOperation, CrsProfile, DatumId, HelmertParameters } from "./types.js"

const RUSSIA_SK42: BBox = { south: 41.19, west: 19.58, north: 81.91, east: -168.97 }
const RUSSIA_WIDE: BBox = { south: 39.87, west: 18.92, north: 85.19, east: -168.97 }

function helmert(
  dx: number,
  dy: number,
  dz: number,
  rx: number,
  ry: number,
  rz: number,
  scalePpm: number,
): HelmertParameters {
  return {
    dx,
    dy,
    dz,
    rxArcsec: rx,
    ryArcsec: ry,
    rzArcsec: rz,
    scalePpm,
    convention: "coordinate_frame",
  }
}

/**
 * Published EPSG operations. 5044 and 5043 are the GOST R 51794-2008 results
 * already concatenated through PZ-90.02. They are not a hand-expanded PZ-90.11
 * element chain; that chain is a separate profile and is not invented here.
 */
export const OPERATIONS: readonly CoordinateOperation[] = [
  {
    id: "epsg-5044",
    name: "Pulkovo 1942 to WGS 84 (20)",
    epsg: 5044,
    sourceDatum: "SK42",
    targetDatum: "WGS84",
    method: "helmert7",
    helmert: helmert(23.57, -140.95, -79.8, 0, -0.35, -0.79, -0.22),
    epoch: null,
    area: RUSSIA_SK42,
    accuracyM: 3,
    source: "EPSG:5044, GOST R 51794-2008",
    remarks:
      "Coordinate Frame rotation. Derived by EPSG through Pulkovo 1942 to PZ-90.02 to WGS 84. Accuracy about 3 m onshore in the Russian Federation.",
  },
  {
    id: "epsg-5043",
    name: "Pulkovo 1995 to WGS 84 (2)",
    epsg: 5043,
    sourceDatum: "SK95",
    targetDatum: "WGS84",
    method: "helmert7",
    helmert: helmert(24.47, -130.89, -81.56, 0, 0, -0.13, -0.22),
    epoch: null,
    area: RUSSIA_WIDE,
    accuracyM: 1,
    source: "EPSG:5043, GOST R 51794-2008",
    remarks:
      "Coordinate Frame rotation. Derived by EPSG through Pulkovo 1995 to PZ-90.02 to WGS 84. Accuracy about 1 m.",
  },
  {
    id: "epsg-9773",
    name: "GSK-2011 to WGS 84 (1)",
    epsg: 9773,
    sourceDatum: "GSK2011",
    targetDatum: "WGS84",
    method: "geocentric_translations",
    helmert: helmert(0, 0, 0, 0, 0, 0, 0),
    epoch: null,
    area: RUSSIA_WIDE,
    accuracyM: 1,
    source: "EPSG:9773",
    remarks:
      "Zero geocentric translations. For many purposes GSK-2011 can be treated as coincident with WGS 84 at the 1 m level. Ellipsoid difference is still applied. This ignores tectonic plate motion.",
  },
]

const OPERATION_BY_DATUM: Record<Exclude<DatumId, "WGS84">, CoordinateOperation> = {
  SK42: OPERATIONS[0]!,
  SK95: OPERATIONS[1]!,
  GSK2011: OPERATIONS[2]!,
}

const ZONE_EPSG: Record<Exclude<DatumId, "WGS84">, number> = {
  SK42: 28400,
  SK95: 20000,
  GSK2011: 20900,
}

const ZONE_NAME: Record<Exclude<DatumId, "WGS84">, string> = {
  SK42: "Pulkovo 1942",
  SK95: "Pulkovo 1995",
  GSK2011: "GSK-2011",
}

function zoneIntersectsRussia(zone: number, area: BBox): boolean {
  const west = 6 * zone - 6
  const east = 6 * zone
  const crosses = area.west > area.east
  const overlaps = (lon: number) => {
    if (!crosses) return lon >= area.west && lon <= area.east
    return lon >= area.west || lon <= area.east
  }
  // Sample the band. A 6° band overlaps the Russia extent when any edge does.
  for (let lon = west; lon <= east; lon += 0.5) {
    const normalized = lon > 180 ? lon - 360 : lon
    if (overlaps(normalized)) return true
  }
  return false
}

function zoneArea(zone: number, datumArea: BBox): BBox {
  let west = 6 * zone - 6
  let east = 6 * zone
  if (west > 180) west -= 360
  if (east > 180) east -= 360
  return { south: datumArea.south, west, north: datumArea.north, east }
}

function buildZones(): CrsProfile[] {
  const profiles: CrsProfile[] = []
  for (const datum of ["SK42", "SK95", "GSK2011"] as const) {
    const operation = OPERATION_BY_DATUM[datum]
    for (let zone = 1; zone <= 32; zone += 1) {
      if (!zoneIntersectsRussia(zone, operation.area)) continue
      const central = 6 * zone - 3
      profiles.push({
        id: `${datum.toLowerCase()}-gk6-z${zone}`,
        name: `${ZONE_NAME[datum]} / Gauss-Kruger zone ${zone}`,
        epsg: ZONE_EPSG[datum] + zone,
        kind: "gauss_kruger_6",
        datum,
        zone,
        centralMeridianDeg: central,
        scale: 1,
        falseEasting: zone * 1_000_000 + 500_000,
        falseNorthing: 0,
        axisOrder: "northing_easting",
        units: "metre",
        area: zoneArea(zone, operation.area),
        operationId: operation.id,
      })
    }
  }
  return profiles
}

export const CRS_PROFILES: readonly CrsProfile[] = buildZones()

export function operationById(id: string): CoordinateOperation | undefined {
  return OPERATIONS.find((operation) => operation.id === id)
}

export function profileById(id: string): CrsProfile | undefined {
  return CRS_PROFILES.find((profile) => profile.id === id)
}

export function profileByEpsg(epsg: number): CrsProfile | undefined {
  return CRS_PROFILES.find((profile) => profile.epsg === epsg)
}

export function profilesForDatum(datum: Exclude<DatumId, "WGS84">): CrsProfile[] {
  return CRS_PROFILES.filter((profile) => profile.datum === datum)
}

export function defaultOperationFor(datum: Exclude<DatumId, "WGS84">): CoordinateOperation {
  return OPERATION_BY_DATUM[datum]
}

export function ellipsoidOf(operation: CoordinateOperation) {
  return operation.sourceDatum === "GSK2011" ? GSK2011 : KRASSOVSKY
}

/** proj4 +towgs84 uses the position-vector sign convention. */
export function proj4Definition(profile: CrsProfile, operation: CoordinateOperation = defaultOperationFor(profile.datum)): string {
  const sign = operation.helmert.convention === "coordinate_frame" ? -1 : 1
  const helmert = operation.helmert
  const towgs84 = [
    helmert.dx,
    helmert.dy,
    helmert.dz,
    sign * helmert.rxArcsec,
    sign * helmert.ryArcsec,
    sign * helmert.rzArcsec,
    helmert.scalePpm,
  ].join(",")
  const ellipsoid =
    profile.datum === "GSK2011"
      ? `+a=${GSK2011.a} +rf=${GSK2011.invF}`
      : "+ellps=krass"
  return [
    "+proj=tmerc",
    "+lat_0=0",
    `+lon_0=${profile.centralMeridianDeg}`,
    `+k=${profile.scale}`,
    `+x_0=${profile.falseEasting}`,
    `+y_0=${profile.falseNorthing}`,
    ellipsoid,
    `+towgs84=${towgs84}`,
    "+units=m",
    "+no_defs",
  ].join(" ")
}

export function projectionOnlyDefinition(profile: CrsProfile): string {
  const ellipsoid =
    profile.datum === "GSK2011"
      ? `+a=${GSK2011.a} +rf=${GSK2011.invF}`
      : "+ellps=krass"
  return [
    "+proj=tmerc",
    "+lat_0=0",
    `+lon_0=${profile.centralMeridianDeg}`,
    `+k=${profile.scale}`,
    `+x_0=${profile.falseEasting}`,
    `+y_0=${profile.falseNorthing}`,
    ellipsoid,
    "+units=m",
    "+no_defs",
  ].join(" ")
}

export function geographicDefinition(profile: CrsProfile): string {
  const ellipsoid =
    profile.datum === "GSK2011"
      ? `+a=${GSK2011.a} +rf=${GSK2011.invF}`
      : "+ellps=krass"
  return `+proj=longlat ${ellipsoid} +no_defs`
}
