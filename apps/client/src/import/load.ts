import { projectedToCrs84, sourceGeographicToCrs84 } from "@cartography/geo-core"
import { unzipSync } from "fflate"
import type { Crs84Geometry } from "@cartography/project-schema"
import { hasHighBytes, readDbf, readShp, type RawGeometry } from "./shp.js"
import { choiceToPrj, classifyPrj, type CrsChoice, type PrjDecision } from "./wkt.js"

export type { CrsChoice }

export type LoadOptions = {
  only?: string
  choice?: CrsChoice
  allowHeight?: boolean
  encoding?: string
}

export type ImportDecide = {
  kind: "decide"
  name: string
  count: number
  needsCrs: boolean
  needsHeight: boolean
  needsEncoding: boolean
}

const MAX_RECORDS = 2000
const NAME_KEYS = ["name", "Name", "NAME", "label", "LABEL", "title", "TITLE"]

export type ImportCode = "missing" | "unknown" | "height" | "encoding" | "too-big" | "empty" | "mixed" | "format"

export type ImportFeature = {
  name: string
  geometry: Crs84Geometry
  properties: Record<string, string | number | boolean>
}

export type ImportReady = {
  kind: "ready"
  name: string
  geometryType: "Point" | "LineString" | "Polygon"
  count: number
  operationName: string | null
  accuracyM: number | null
  outside: boolean
  features: ImportFeature[]
  crsWkt: string | null
  operationId: string | null
  profileId: string | null
}

export type ImportOutcome = ImportReady | ImportDecide | { kind: "blocked"; code: ImportCode; count?: number } | { kind: "choose"; names: string[] }

type Group = { name: string; shp?: Uint8Array; dbf?: Uint8Array; prj?: string; cpg?: string }

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).replace(/^\uFEFF/, "").trim()
}

function groupsOf(files: Record<string, Uint8Array>): Group[] {
  const groups = new Map<string, Group>()
  for (const [path, bytes] of Object.entries(files)) {
    const base = path.split("/").pop() ?? path
    const match = /^(.*)\.(shp|dbf|prj|cpg|shx)$/i.exec(base)
    if (!match?.[1] || !match[2]) continue
    const key = match[1].toLowerCase()
    const group = groups.get(key) ?? { name: match[1] }
    const ext = match[2].toLowerCase()
    if (ext === "shp") group.shp = bytes
    if (ext === "dbf") group.dbf = bytes
    if (ext === "prj") group.prj = text(bytes)
    if (ext === "cpg") group.cpg = text(bytes)
    groups.set(key, group)
  }
  return [...groups.values()].filter((group) => group.shp)
}

function featureName(properties: Record<string, string | number | boolean>, index: number): string {
  for (const key of NAME_KEYS) {
    const value = properties[key]
    if (typeof value === "string" && value) return value
  }
  return `Feature ${index + 1}`
}

function convertPoint(decision: PrjDecision, x: number, y: number): { coordinate: [number, number]; outside: boolean } | null {
  if (decision.kind === "blocked") return null
  if (decision.kind === "wgs84") return { coordinate: [x, y], outside: false }
  if (decision.kind === "geographic") {
    const [longitude, latitude] = sourceGeographicToCrs84(x, y, decision.operation)
    return { coordinate: [longitude, latitude], outside: false }
  }
  const result = projectedToCrs84([x, y], decision.profile, { operation: decision.operation, notation: decision.notation })
  return { coordinate: [result.coordinate[0], result.coordinate[1]], outside: result.outsideAreaOfUse }
}

function convertGeometry(decision: PrjDecision, geometry: RawGeometry): { geometry: Crs84Geometry; outside: boolean } | null {
  let outside = false
  const mapPair = (pair: [number, number]): [number, number] | null => {
    const converted = convertPoint(decision, pair[0], pair[1])
    if (!converted) return null
    outside = outside || converted.outside
    return converted.coordinate
  }
  if (geometry.type === "Point") {
    const coordinate = mapPair(geometry.coordinates)
    return coordinate ? { geometry: { type: "Point", coordinates: coordinate }, outside } : null
  }
  if (geometry.type === "LineString") {
    const coordinates = geometry.coordinates.map(mapPair)
    if (coordinates.some((item) => !item)) return null
    return { geometry: { type: "LineString", coordinates: coordinates as [number, number][] }, outside }
  }
  const coordinates = geometry.coordinates.map((ring) => ring.map(mapPair))
  if (coordinates.some((ring) => ring.some((item) => !item))) return null
  return { geometry: { type: "Polygon", coordinates: coordinates as [number, number][][] }, outside }
}

function fromShapefile(group: Group, options: LoadOptions = {}): ImportOutcome {
  if (!group.shp) return { kind: "blocked", code: "format" }
  const shp = readShp(group.shp)
  const needsCrs = !group.prj && !options.choice
  const needsHeight = shp.height && !options.allowHeight
  const needsEncoding = !group.cpg && !options.encoding && !!group.dbf && hasHighBytes(group.dbf)
  if (needsCrs || needsHeight || needsEncoding) {
    return { kind: "decide", name: group.name, count: shp.records.length, needsCrs, needsHeight, needsEncoding }
  }
  const decision = options.choice ? choiceToPrj(options.choice) : classifyPrj(group.prj)
  if (decision.kind === "blocked") return { kind: "blocked", code: decision.code === "missing" ? "missing" : "unknown" }
  const encoding = options.encoding || group.cpg || "utf-8"
  const rows = group.dbf ? readDbf(group.dbf, encoding) : []
  if (shp.records.length > MAX_RECORDS) return { kind: "blocked", code: "too-big", count: MAX_RECORDS }
  const features: ImportFeature[] = []
  let outside = false
  let failed = false
  shp.records.forEach((record, index) => {
    const properties = rows[index] ?? {}
    for (const geometry of record.geometries) {
      const converted = convertGeometry(decision, geometry)
      if (!converted) {
        failed = true
        return
      }
      outside = outside || converted.outside
      const name = featureName(properties, features.length)
      features.push({ name, geometry: converted.geometry, properties: { ...properties, name } })
    }
  })
  if (failed) return { kind: "blocked", code: "unknown" }
  if (features.length === 0) return { kind: "blocked", code: "empty" }
  const geometryType = features[0]?.geometry.type
  if (!geometryType || features.some((feature) => feature.geometry.type !== geometryType)) return { kind: "blocked", code: "mixed" }
  const operation = decision.kind === "wgs84" ? null : decision.operation
  return {
    kind: "ready",
    name: group.name,
    geometryType,
    count: features.length,
    operationName: operation?.name ?? null,
    accuracyM: operation?.accuracyM ?? null,
    outside,
    features,
    crsWkt: group.prj ?? null,
    operationId: operation?.id ?? null,
    profileId: decision.kind === "projected" ? decision.profile.id : null,
  }
}

export function loadBytes(name: string, bytes: Uint8Array, options: LoadOptions = {}): ImportOutcome {
  if (/\.geojson$/i.test(name) || /\.json$/i.test(name)) return fromGeoJson(name, text(bytes))
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    return { kind: "blocked", code: "format" }
  }
  const groups = groupsOf(files)
  if (groups.length === 0) return { kind: "blocked", code: "format" }
  if (!options.only && groups.length > 1) return { kind: "choose", names: groups.map((group) => group.name) }
  const group = groups.find((item) => item.name === options.only) ?? groups[0]
  if (!group) return { kind: "blocked", code: "format" }
  return fromShapefile(group, options)
}

function pair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const x = Number(value[0])
  const y = Number(value[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return [x, y]
}

function geometryOf(value: unknown): Crs84Geometry | null {
  if (!value || typeof value !== "object") return null
  const geometry = value as { type?: string; coordinates?: unknown }
  if (geometry.type === "Point") {
    const coordinate = pair(geometry.coordinates)
    return coordinate ? { type: "Point", coordinates: coordinate } : null
  }
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    const coordinates = geometry.coordinates.map(pair)
    if (coordinates.some((item) => !item)) return null
    return { type: "LineString", coordinates: coordinates as [number, number][] }
  }
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const coordinates = geometry.coordinates.map((ring) => (Array.isArray(ring) ? ring.map(pair) : [null]))
    if (coordinates.some((ring) => ring.some((item) => !item))) return null
    return { type: "Polygon", coordinates: coordinates as [number, number][][] }
  }
  return null
}

function fromGeoJson(name: string, body: string): ImportOutcome {
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    return { kind: "blocked", code: "format" }
  }
  const collection = parsed as { type?: string; features?: unknown[] }
  const items = collection.type === "FeatureCollection" && Array.isArray(collection.features) ? collection.features : [parsed]
  const features: ImportFeature[] = []
  for (const item of items) {
    const record = item as { geometry?: unknown; properties?: Record<string, unknown> }
    const geometry = geometryOf(record.geometry ?? item)
    if (!geometry) continue
    const properties: Record<string, string | number | boolean> = {}
    for (const [key, value] of Object.entries(record.properties ?? {})) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") properties[key] = value
    }
    const featureNameValue = featureName(properties, features.length)
    features.push({ name: featureNameValue, geometry, properties: { ...properties, name: featureNameValue } })
  }
  if (features.length === 0) return { kind: "blocked", code: "empty" }
  if (features.length > MAX_RECORDS) return { kind: "blocked", code: "too-big", count: MAX_RECORDS }
  const geometryType = features[0]?.geometry.type
  if (!geometryType || features.some((feature) => feature.geometry.type !== geometryType)) return { kind: "blocked", code: "mixed" }
  const degrees = features.every((feature) => inDegrees(feature.geometry))
  if (!degrees) return { kind: "blocked", code: "unknown" }
  return { kind: "ready", name: name.replace(/\.(geo)?json$/i, ""), geometryType, count: features.length, operationName: null, accuracyM: null, outside: false, features, crsWkt: null, operationId: null, profileId: null }
}

function inDegrees(geometry: Crs84Geometry): boolean {
  const pairs = geometry.type === "Point" ? [geometry.coordinates] : geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates.flat()
  return pairs.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90)
}
