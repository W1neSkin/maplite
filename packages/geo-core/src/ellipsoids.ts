import type { DatumId, Ellipsoid } from "./types.js"

export const KRASSOVSKY: Ellipsoid = {
  name: "Krassowsky 1940",
  a: 6_378_245,
  invF: 298.3,
}

export const WGS84: Ellipsoid = {
  name: "WGS 84",
  a: 6_378_137,
  invF: 298.257223563,
}

export const GSK2011: Ellipsoid = {
  name: "GSK-2011",
  a: 6_378_136.5,
  invF: 298.2564151,
}

export function ellipsoidFor(datum: DatumId): Ellipsoid {
  switch (datum) {
    case "SK42":
    case "SK95":
      return KRASSOVSKY
    case "GSK2011":
      return GSK2011
    case "WGS84":
      return WGS84
  }
}

export function flattening(ell: Ellipsoid): number {
  return 1 / ell.invF
}

export function eccentricitySquared(ell: Ellipsoid): number {
  const f = flattening(ell)
  return f * (2 - f)
}
