import { geocentricToGeodetic, geodeticToGeocentric, type Geocentric } from "./geocentric.js"
import type { Ellipsoid, HelmertParameters } from "./types.js"

const ARCSEC = Math.PI / (180 * 3600)

/**
 * EPSG position-vector matrix (method 9606 / 1033). Coordinate-frame parameters
 * (method 9607 / 1032) are the same translations and scale with the opposite
 * rotation signs. Scale sits on the diagonal only; rotations are radians.
 *
 *   | Xs |   | dX |   | 1+s   -rz   ry | | Xt |
 *   | Ys | = | dY | + | rz    1+s  -rx | | Yt |
 *   | Zs |   | dZ |   | -ry    rx  1+s | | Zt |
 */
function linearMatrix(parameters: HelmertParameters): number[][] {
  let rx = parameters.rxArcsec * ARCSEC
  let ry = parameters.ryArcsec * ARCSEC
  let rz = parameters.rzArcsec * ARCSEC
  if (parameters.convention === "coordinate_frame") {
    rx = -rx
    ry = -ry
    rz = -rz
  }
  const scale = 1 + parameters.scalePpm * 1e-6
  return [
    [scale, -rz, ry],
    [rz, scale, -rx],
    [-ry, rx, scale],
  ]
}

function apply(matrix: number[][], vector: Geocentric): Geocentric {
  return [
    matrix[0]![0]! * vector[0] + matrix[0]![1]! * vector[1] + matrix[0]![2]! * vector[2],
    matrix[1]![0]! * vector[0] + matrix[1]![1]! * vector[1] + matrix[1]![2]! * vector[2],
    matrix[2]![0]! * vector[0] + matrix[2]![1]! * vector[1] + matrix[2]![2]! * vector[2],
  ]
}

function invert3(matrix: number[][]): number[][] {
  const [a, b, c] = [matrix[0]![0]!, matrix[0]![1]!, matrix[0]![2]!]
  const [d, e, f] = [matrix[1]![0]!, matrix[1]![1]!, matrix[1]![2]!]
  const [g, h, i] = [matrix[2]![0]!, matrix[2]![1]!, matrix[2]![2]!]
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-18) {
    throw new Error("Helmert matrix is singular")
  }
  const inv = 1 / det
  return [
    [(e * i - f * h) * inv, (c * h - b * i) * inv, (b * f - c * e) * inv],
    [(f * g - d * i) * inv, (a * i - c * g) * inv, (c * d - a * f) * inv],
    [(d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv],
  ]
}

export function helmertForward(point: Geocentric, parameters: HelmertParameters): Geocentric {
  const shifted = apply(linearMatrix(parameters), point)
  return [shifted[0] + parameters.dx, shifted[1] + parameters.dy, shifted[2] + parameters.dz]
}

export function helmertInverse(point: Geocentric, parameters: HelmertParameters): Geocentric {
  const inverse = invert3(linearMatrix(parameters))
  return apply(inverse, [point[0] - parameters.dx, point[1] - parameters.dy, point[2] - parameters.dz])
}

export function geographicToWgs84(
  longitudeDeg: number,
  latitudeDeg: number,
  source: Ellipsoid,
  parameters: HelmertParameters,
): { longitudeDeg: number; latitudeDeg: number } {
  const sourceXyz = geodeticToGeocentric(longitudeDeg, latitudeDeg, 0, source)
  const targetXyz = helmertForward(sourceXyz, parameters)
  const geographic = geocentricToGeodetic(targetXyz[0], targetXyz[1], targetXyz[2], {
    name: "WGS 84",
    a: 6_378_137,
    invF: 298.257223563,
  })
  return { longitudeDeg: geographic.longitudeDeg, latitudeDeg: geographic.latitudeDeg }
}

export function wgs84ToGeographic(
  longitudeDeg: number,
  latitudeDeg: number,
  source: Ellipsoid,
  parameters: HelmertParameters,
): { longitudeDeg: number; latitudeDeg: number } {
  const targetXyz = geodeticToGeocentric(longitudeDeg, latitudeDeg, 0, {
    name: "WGS 84",
    a: 6_378_137,
    invF: 298.257223563,
  })
  const sourceXyz = helmertInverse(targetXyz, parameters)
  const geographic = geocentricToGeodetic(sourceXyz[0], sourceXyz[1], sourceXyz[2], source)
  return { longitudeDeg: geographic.longitudeDeg, latitudeDeg: geographic.latitudeDeg }
}
