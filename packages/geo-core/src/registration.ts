import { GeoError, type ProjectedCoordinate } from "./types.js"

export type ControlRole = "fit" | "check"

export type ControlInput = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly easting: number
  readonly northing: number
  readonly weight?: number
  readonly role: ControlRole
}

export type Similarity = {
  readonly tx: number
  readonly ty: number
  readonly scale: number
  readonly rotationRad: number
  readonly ppm: number
}

export type PointResidual = {
  readonly id: string
  readonly role: ControlRole
  readonly de: number
  readonly dn: number
  readonly horizontalM: number
}

export type RegistrationSolution = {
  readonly similarity: Similarity
  readonly residuals: readonly PointResidual[]
  readonly rmsM: number
  readonly maxResidualM: number
  readonly fitCount: number
  readonly checkCount: number
  readonly exact: boolean
  readonly hull: readonly ProjectedCoordinate[]
}

function weightOf(point: ControlInput): number {
  const weight = point.weight ?? 1
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new GeoError("invalid_weight", `Control point ${point.id} has a non-positive weight`)
  }
  return weight
}

function applyRaw(x: number, y: number, tx: number, ty: number, a: number, b: number): ProjectedCoordinate {
  return [tx + a * x - b * y, ty + b * x + a * y]
}

export function applySimilarity(x: number, y: number, similarity: Similarity): ProjectedCoordinate {
  const a = similarity.scale * Math.cos(similarity.rotationRad)
  const b = similarity.scale * Math.sin(similarity.rotationRad)
  return applyRaw(x, y, similarity.tx, similarity.ty, a, b)
}

function similarityFrom(tx: number, ty: number, a: number, b: number): Similarity {
  const scale = Math.hypot(a, b)
  return { tx, ty, scale, rotationRad: Math.atan2(b, a), ppm: (scale - 1) * 1e6 }
}

function maxBaseline(points: readonly ControlInput[]): number {
  let max = 0
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const left = points[i]!
      const right = points[j]!
      max = Math.max(max, Math.hypot(left.x - right.x, left.y - right.y))
    }
  }
  return max
}

function solve4(matrix: number[][], rhs: number[]): number[] {
  const size = rhs.length
  const rows = matrix.map((row, index) => [...row, rhs[index]!])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = row
    }
    if (Math.abs(rows[pivot]![column]!) < 1e-12) {
      throw new GeoError("degenerate_network", "The control points do not determine a stable similarity")
    }
    const swap = rows[column]!
    rows[column] = rows[pivot]!
    rows[pivot] = swap
    const divisor = rows[column]![column]!
    for (let col = column; col <= size; col += 1) rows[column]![col]! /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = rows[row]![column]!
      for (let col = column; col <= size; col += 1) rows[row]![col]! -= factor * rows[column]![col]!
    }
  }
  return rows.map((row) => row[size]!)
}

function leastSquares(points: readonly ControlInput[]): { tx: number; ty: number; a: number; b: number } {
  const normal = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  const rhs = [0, 0, 0, 0]
  for (const point of points) {
    const weight = weightOf(point)
    const rows = [
      { design: [1, 0, point.x, -point.y], target: point.easting },
      { design: [0, 1, point.y, point.x], target: point.northing },
    ]
    for (const observation of rows) {
      for (let i = 0; i < 4; i += 1) {
        rhs[i]! += weight * observation.design[i]! * observation.target
        for (let k = 0; k < 4; k += 1) {
          normal[i]![k]! += weight * observation.design[i]! * observation.design[k]!
        }
      }
    }
  }
  const [tx, ty, a, b] = solve4(normal, rhs)
  return { tx: tx!, ty: ty!, a: a!, b: b! }
}

function twoPoint(first: ControlInput, second: ControlInput): { tx: number; ty: number; a: number; b: number } {
  const dx = second.x - first.x
  const dy = second.y - first.y
  const dE = second.easting - first.easting
  const dN = second.northing - first.northing
  const det = dx * dx + dy * dy
  if (det < 1) {
    throw new GeoError("short_baseline", "Two control points need a baseline of at least 1 m")
  }
  const a = (dx * dE + dy * dN) / det
  const b = (dx * dN - dy * dE) / det
  const tx = first.easting - (a * first.x - b * first.y)
  const ty = first.northing - (b * first.x + a * first.y)
  return { tx, ty, a, b }
}

export function convexHull(points: readonly ProjectedCoordinate[]): ProjectedCoordinate[] {
  const unique = [...points]
    .filter((point, index, all) => all.findIndex((other) => other[0] === point[0] && other[1] === point[1]) === index)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1])
  if (unique.length <= 2) return unique
  const cross = (o: ProjectedCoordinate, a: ProjectedCoordinate, b: ProjectedCoordinate) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: ProjectedCoordinate[] = []
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: ProjectedCoordinate[] = []
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop()
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

function distanceToSegment(point: ProjectedCoordinate, start: ProjectedCoordinate, end: ProjectedCoordinate): number {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length2 = dx * dx + dy * dy
  if (length2 === 0) return Math.hypot(point[0] - start[0], point[1] - start[1])
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2))
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy))
}

export function networkRelation(
  point: ProjectedCoordinate,
  hull: readonly ProjectedCoordinate[],
): { inside: boolean; distanceToBoundaryM: number } {
  if (hull.length === 0) return { inside: false, distanceToBoundaryM: Number.POSITIVE_INFINITY }
  if (hull.length === 1) {
    const distance = Math.hypot(point[0] - hull[0]![0], point[1] - hull[0]![1])
    return { inside: distance <= 1e-6, distanceToBoundaryM: distance }
  }
  if (hull.length === 2) {
    const distance = distanceToSegment(point, hull[0]!, hull[1]!)
    return { inside: distance <= 1e-6, distanceToBoundaryM: distance }
  }
  let inside = false
  let distance = Number.POSITIVE_INFINITY
  for (let index = 0, previous = hull.length - 1; index < hull.length; previous = index, index += 1) {
    const start = hull[previous]!
    const end = hull[index]!
    distance = Math.min(distance, distanceToSegment(point, start, end))
    const intersects =
      end[1] > point[1] !== start[1] > point[1] &&
      point[0] < ((start[0] - end[0]) * (point[1] - end[1])) / (start[1] - end[1]) + end[0]
    if (intersects) inside = !inside
  }
  return { inside: inside || distance <= 1e-6, distanceToBoundaryM: distance }
}

export function solveSimilarity(points: readonly ControlInput[]): RegistrationSolution {
  const fit = points.filter((point) => point.role === "fit")
  const checks = points.filter((point) => point.role === "check")
  if (fit.length < 1) {
    throw new GeoError("not_enough_points", "At least one fit point is required")
  }
  if (fit.length >= 2 && maxBaseline(fit) < 1) {
    throw new GeoError("short_baseline", "The fit points span less than 1 m")
  }
  let tx: number
  let ty: number
  let a: number
  let b: number
  let exact = false
  if (fit.length === 1) {
    const only = fit[0]!
    tx = only.easting - only.x
    ty = only.northing - only.y
    a = 1
    b = 0
  } else if (fit.length === 2) {
    const solved = twoPoint(fit[0]!, fit[1]!)
    tx = solved.tx
    ty = solved.ty
    a = solved.a
    b = solved.b
    exact = true
  } else {
    const solved = leastSquares(fit)
    tx = solved.tx
    ty = solved.ty
    a = solved.a
    b = solved.b
  }
  const similarity = similarityFrom(tx, ty, a, b)
  const residuals = points.map((point) => {
    const predicted = applyRaw(point.x, point.y, tx, ty, a, b)
    const de = predicted[0] - point.easting
    const dn = predicted[1] - point.northing
    return { id: point.id, role: point.role, de, dn, horizontalM: Math.hypot(de, dn) }
  })
  const fitted = residuals.filter((residual) => residual.role === "fit")
  let weightSum = 0
  let squareSum = 0
  for (const point of fit) {
    const residual = fitted.find((item) => item.id === point.id)!
    const weight = weightOf(point)
    weightSum += weight
    squareSum += weight * residual.horizontalM * residual.horizontalM
  }
  const hull = convexHull(fit.map((point) => [point.easting, point.northing] as const))
  return {
    similarity,
    residuals,
    rmsM: Math.sqrt(squareSum / weightSum),
    maxResidualM: Math.max(...fitted.map((residual) => residual.horizontalM)),
    fitCount: fit.length,
    checkCount: checks.length,
    exact,
    hull,
  }
}
