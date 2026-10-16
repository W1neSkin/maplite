/** Longitude, latitude in decimal degrees. OGC:CRS84 axis order. */
export type Crs84Coordinate = readonly [longitude: number, latitude: number]

/** Easting, northing in metres. This is not the EPSG axis order. */
export type ProjectedCoordinate = readonly [easting: number, northing: number]

export type RotationConvention = "coordinate_frame" | "position_vector"

export type EastingNotation = "full" | "truncated"

export type DatumId = "SK42" | "SK95" | "GSK2011" | "WGS84"

export type Ellipsoid = {
  readonly name: string
  readonly a: number
  readonly invF: number
}

export type BBox = {
  readonly south: number
  readonly west: number
  readonly north: number
  readonly east: number
}

/** Seven-parameter Helmert. Rotations are arc-seconds, scale is ppm. */
export type HelmertParameters = {
  readonly dx: number
  readonly dy: number
  readonly dz: number
  readonly rxArcsec: number
  readonly ryArcsec: number
  readonly rzArcsec: number
  readonly scalePpm: number
  readonly convention: RotationConvention
}

export type OperationMethod = "helmert7" | "geocentric_translations"

export type CoordinateOperation = {
  readonly id: string
  readonly name: string
  readonly epsg: number | null
  readonly sourceDatum: Exclude<DatumId, "WGS84">
  readonly targetDatum: "WGS84"
  readonly method: OperationMethod
  readonly helmert: HelmertParameters
  readonly epoch: string | null
  readonly area: BBox
  readonly accuracyM: number
  readonly source: string
  readonly remarks: string
}

export type CrsProfile = {
  readonly id: string
  readonly name: string
  readonly epsg: number
  readonly kind: "gauss_kruger_6"
  readonly datum: Exclude<DatumId, "WGS84">
  readonly zone: number
  readonly centralMeridianDeg: number
  readonly scale: number
  readonly falseEasting: number
  readonly falseNorthing: number
  readonly axisOrder: "northing_easting"
  readonly units: "metre"
  readonly area: BBox
  readonly operationId: string
}

export type TransformResult = {
  readonly coordinate: Crs84Coordinate
  readonly outsideAreaOfUse: boolean
}

export class GeoError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "GeoError"
    this.code = code
  }
}
