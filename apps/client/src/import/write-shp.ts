import type { Crs84Geometry, Feature, GeometryType, JsonValue } from "@cartography/project-schema"
import { strToU8, zipSync } from "fflate"

const WGS84 = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]'
const SHAPE_TYPE: Record<GeometryType, number> = { Point: 1, LineString: 3, Polygon: 5 }

type Xy = [number, number]
type Field = { name: string; type: "C" | "N" | "L"; length: number }

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

function area(ring: Xy[]): number {
  let sum = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]!
    const [x2, y2] = ring[index + 1]!
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

function close(ring: Xy[]): Xy[] {
  const first = ring[0]
  const last = ring.at(-1)
  if (!first || !last || (first[0] === last[0] && first[1] === last[1])) return ring
  return [...ring, first]
}

function clockwise(ring: Xy[], wantClockwise: boolean): Xy[] {
  const closed = close(ring)
  const isClockwise = area(closed) < 0
  return isClockwise === wantClockwise ? closed : [...closed].reverse()
}

function ringsOf(geometry: Crs84Geometry): Xy[][] {
  if (geometry.type === "Point") return [[geometry.coordinates]]
  if (geometry.type === "LineString") return [geometry.coordinates]
  return geometry.coordinates.map((ring, index) => clockwise(ring, index === 0))
}

function bounds(rings: Xy[][]): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (!Number.isFinite(minX)) return [0, 0, 0, 0]
  return [minX, minY, maxX, maxY]
}

function header(shapeType: number, box: [number, number, number, number], words: number): Uint8Array {
  const bytes = new Uint8Array(100)
  const view = new DataView(bytes.buffer)
  view.setInt32(0, 9994, false)
  view.setInt32(24, words, false)
  view.setInt32(28, 1000, true)
  view.setInt32(32, shapeType, true)
  view.setFloat64(36, box[0], true)
  view.setFloat64(44, box[1], true)
  view.setFloat64(52, box[2], true)
  view.setFloat64(60, box[3], true)
  return bytes
}

function record(number: number, content: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + content.byteLength)
  const view = new DataView(bytes.buffer)
  view.setInt32(0, number, false)
  view.setInt32(4, content.byteLength / 2, false)
  bytes.set(content, 8)
  return bytes
}

function contentOf(geometry: Crs84Geometry): Uint8Array {
  const rings = ringsOf(geometry)
  if (geometry.type === "Point") {
    const bytes = new Uint8Array(20)
    const view = new DataView(bytes.buffer)
    view.setInt32(0, 1, true)
    view.setFloat64(4, geometry.coordinates[0], true)
    view.setFloat64(12, geometry.coordinates[1], true)
    return bytes
  }
  const points = rings.flat()
  const box = bounds(rings)
  const bytes = new Uint8Array(44 + rings.length * 4 + points.length * 16)
  const view = new DataView(bytes.buffer)
  view.setInt32(0, geometry.type === "LineString" ? 3 : 5, true)
  view.setFloat64(4, box[0], true)
  view.setFloat64(12, box[1], true)
  view.setFloat64(20, box[2], true)
  view.setFloat64(28, box[3], true)
  view.setInt32(36, rings.length, true)
  view.setInt32(40, points.length, true)
  let cursor = 0
  rings.forEach((ring, index) => {
    view.setInt32(44 + index * 4, cursor, true)
    cursor += ring.length
  })
  points.forEach((point, index) => {
    view.setFloat64(44 + rings.length * 4 + index * 16, point[0], true)
    view.setFloat64(44 + rings.length * 4 + index * 16 + 8, point[1], true)
  })
  return bytes
}

function geometries(shapeType: number, features: readonly Feature[]): { shp: Uint8Array; shx: Uint8Array } {
  const records = features.map((feature, index) => record(index + 1, contentOf(feature.geometry)))
  const box = bounds(features.map((feature) => ringsOf(feature.geometry)).flat())
  const body = concat(records)
  const words = (100 + body.byteLength) / 2
  const shp = concat([header(shapeType, box, words), body])
  const index = new Uint8Array(records.length * 8)
  const view = new DataView(index.buffer)
  let offset = 50
  records.forEach((item, index) => {
    view.setInt32(index * 8, offset, false)
    view.setInt32(index * 8 + 4, (item.byteLength - 8) / 2, false)
    offset += item.byteLength / 2
  })
  const shx = concat([header(shapeType, box, 50 + records.length * 4), index])
  return { shp, shx }
}

function fieldName(key: string, used: Set<string>): string {
  const ascii = key.replace(/[^A-Za-z0-9_]/g, "").toUpperCase().slice(0, 10) || "FIELD"
  let name = ascii
  let suffix = 2
  while (used.has(name)) {
    const tail = String(suffix)
    name = `${ascii.slice(0, 10 - tail.length)}${tail}`
    suffix += 1
  }
  used.add(name)
  return name
}

function primitive(value: JsonValue | undefined): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  return null
}

function writeDbf(features: readonly Feature[]): Uint8Array {
  const used = new Set<string>(["NAME"])
  const extras = new Map<string, Field>()
  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties)) {
      if (key.toLowerCase() === "name" || extras.has(key) || primitive(value) == null) continue
      const kind = typeof value === "number" ? "N" : typeof value === "boolean" ? "L" : "C"
      extras.set(key, { name: fieldName(key, used), type: kind, length: kind === "L" ? 1 : kind === "N" ? 18 : 80 })
    }
  }
  const fields: Field[] = [{ name: "NAME", type: "C", length: 80 }, ...extras.values()]
  const recordSize = 1 + fields.reduce((sum, field) => sum + field.length, 0)
  const headerSize = 32 + fields.length * 32 + 1
  const bytes = new Uint8Array(headerSize + features.length * recordSize + 1)
  const view = new DataView(bytes.buffer)
  bytes[0] = 3
  view.setUint32(4, features.length, true)
  view.setUint16(8, headerSize, true)
  view.setUint16(10, recordSize, true)
  fields.forEach((field, index) => {
    const at = 32 + index * 32
    for (let char = 0; char < field.name.length; char += 1) bytes[at + char] = field.name.charCodeAt(char)
    bytes[at + 11] = field.type.charCodeAt(0)
    bytes[at + 16] = field.length
  })
  bytes[headerSize - 1] = 0x0d
  const encoder = new TextEncoder()
  features.forEach((feature, index) => {
    const at = headerSize + index * recordSize
    bytes[at] = 0x20
    let cursor = at + 1
    const values = new Map<string, string | number | boolean>([["NAME", String(feature.properties.name ?? feature.id)]])
    for (const [key, field] of extras) {
      const value = primitive(feature.properties[key])
      if (value != null) values.set(field.name, value)
    }
    for (const field of fields) {
      const raw = values.get(field.name)
      const text = raw == null ? "" : typeof raw === "boolean" ? (raw ? "T" : "F") : typeof raw === "number" ? raw.toString() : raw
      const encoded = encoder.encode(text).slice(0, field.length)
      bytes.set(encoded, cursor)
      cursor += field.length
    }
  })
  bytes[bytes.byteLength - 1] = 0x1a
  return bytes
}

function baseName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)
  return cleaned || "layer"
}

/** A WGS 84 shapefile zip: shp, shx, dbf, prj, and cpg. */
export function layerZip(name: string, geometryType: GeometryType, features: readonly Feature[]): { filename: string; bytes: Uint8Array } {
  const base = baseName(name)
  const same = features.filter((feature) => feature.geometry.type === geometryType)
  const { shp, shx } = geometries(SHAPE_TYPE[geometryType], same)
  const bytes = zipSync({
    [`${base}.shp`]: shp,
    [`${base}.shx`]: shx,
    [`${base}.dbf`]: writeDbf(same),
    [`${base}.prj`]: strToU8(WGS84),
    [`${base}.cpg`]: strToU8("UTF-8"),
  })
  return { filename: `${base}.zip`, bytes }
}
