import { eccentricitySquared } from "./ellipsoids.js"
import type { Ellipsoid } from "./types.js"

export type Geocentric = readonly [x: number, y: number, z: number]

const DEG = Math.PI / 180

export function geodeticToGeocentric(
  longitudeDeg: number,
  latitudeDeg: number,
  heightM: number,
  ell: Ellipsoid,
): Geocentric {
  const e2 = eccentricitySquared(ell)
  const lon = longitudeDeg * DEG
  const lat = latitudeDeg * DEG
  const sinLat = Math.sin(lat)
  const cosLat = Math.cos(lat)
  const radius = ell.a / Math.sqrt(1 - e2 * sinLat * sinLat)
  return [
    (radius + heightM) * cosLat * Math.cos(lon),
    (radius + heightM) * cosLat * Math.sin(lon),
    (radius * (1 - e2) + heightM) * sinLat,
  ]
}

/** Bowring's method. Accurate to well under a millimetre for these ellipsoids. */
export function geocentricToGeodetic(
  x: number,
  y: number,
  z: number,
  ell: Ellipsoid,
): { longitudeDeg: number; latitudeDeg: number; heightM: number } {
  const a = ell.a
  const f = 1 / ell.invF
  const b = a * (1 - f)
  const e2 = eccentricitySquared(ell)
  const ep2 = (a * a - b * b) / (b * b)
  const longitude = Math.atan2(y, x)
  const p = Math.hypot(x, y)
  const theta = Math.atan2(z * a, p * b)
  const sinTheta = Math.sin(theta)
  const cosTheta = Math.cos(theta)
  const latitude = Math.atan2(
    z + ep2 * b * sinTheta ** 3,
    p - e2 * a * cosTheta ** 3,
  )
  const sinLat = Math.sin(latitude)
  const radius = a / Math.sqrt(1 - e2 * sinLat * sinLat)
  const height = p / Math.cos(latitude) - radius
  return {
    longitudeDeg: normalizeLongitude(longitude / DEG),
    latitudeDeg: latitude / DEG,
    heightM: height,
  }
}

export function normalizeLongitude(longitudeDeg: number): number {
  let lon = longitudeDeg
  while (lon > 180) lon -= 360
  while (lon < -180) lon += 360
  if (lon === -180) return 180
  return lon
}
