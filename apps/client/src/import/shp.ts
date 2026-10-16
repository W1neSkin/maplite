type Xy = [number, number]
type Ring = Xy[]

export type RawGeometry =
  | { type: "Point"; coordinates: Xy }
  | { type: "LineString"; coordinates: Ring }
  | { type: "Polygon"; coordinates: Ring[] }

export type RawRecord = { geometry: RawGeometry; properties: Record<string, string | number | boolean> }

const HEIGHT_TYPES = new Set([11, 13, 15, 18, 21, 23, 25, 28, 31])

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function ringArea(ring: Ring): number {
  let sum = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]!
    const [x2, y2] = ring[index + 1]!
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

function orient(ring: Ring, clockwise: boolean): Ring {
  const copy = ring.slice()
  const isClockwise = ringArea(copy) < 0
  return isClockwise === clockwise ? copy : copy.reverse()
}

function readParts(view: DataView, offset: number): Ring[] {
  const numParts = view.getInt32(offset + 36, true)
  const numPoints = view.getInt32(offset + 40, true)
  const parts: number[] = []
  for (let index = 0; index < numParts; index += 1) parts.push(view.getInt32(offset + 44 + index * 4, true))
  const pointsAt = offset + 44 + numParts * 4
  const points: Xy[] = []
  for (let index = 0; index < numPoints; index += 1) {
    points.push([view.getFloat64(pointsAt + index * 16, true), view.getFloat64(pointsAt + index * 16 + 8, true)])
  }
  return parts.map((start, index) => points.slice(start, parts[index + 1] ?? points.length))
}

function polygonsOf(parts: Ring[]): RawGeometry[] {
  const polygons: Ring[][] = []
  for (const part of parts) {
    const outer = ringArea(part) < 0
    if (outer || polygons.length === 0) polygons.push([orient(part, false)])
    else polygons.at(-1)?.push(orient(part, true))
  }
  return polygons.map((coordinates) => ({ type: "Polygon", coordinates }))
}

export type ShpRecord = { geometries: RawGeometry[] }

export function readShp(bytes: Uint8Array): { height: boolean; records: ShpRecord[] } {
  const view = viewOf(bytes)
  if (bytes.byteLength < 100 || view.getInt32(0, false) !== 9994) throw new Error("format")
  const shapeType = view.getInt32(32, true)
  const records: ShpRecord[] = []
  let offset = 100
  while (offset + 8 <= bytes.byteLength) {
    const words = view.getInt32(offset + 4, false)
    if (words <= 0) break
    const content = offset + 8
    const type = flatType(view.getInt32(content, true))
    if (type === 1) records.push({ geometries: [{ type: "Point", coordinates: [view.getFloat64(content + 4, true), view.getFloat64(content + 12, true)] }] })
    else if (type === 3) records.push({ geometries: readParts(view, content).map((part) => ({ type: "LineString", coordinates: part })) })
    else if (type === 5) records.push({ geometries: polygonsOf(readParts(view, content)) })
    else records.push({ geometries: [] })
    offset = content + words * 2
  }
  return { height: HEIGHT_TYPES.has(shapeType), records }
}

function flatType(type: number): number {
  if (type === 11 || type === 21) return 1
  if (type === 13 || type === 23) return 3
  if (type === 15 || type === 25) return 5
  return type
}

type Field = { name: string; type: string; length: number; offset: number }

function decode(bytes: Uint8Array, encoding: string): string {
  return new TextDecoder(encoding).decode(bytes).replace(/\0/g, "").trim()
}

export function readDbf(bytes: Uint8Array, encoding: string): Record<string, string | number | boolean>[] {
  const view = viewOf(bytes)
  const count = view.getUint32(4, true)
  const headerSize = view.getUint16(8, true)
  const recordSize = view.getUint16(10, true)
  const fields: Field[] = []
  let cursor = 32
  let valueOffset = 1
  while (cursor < headerSize - 1 && bytes[cursor] !== 0x0d) {
    const name = decode(bytes.subarray(cursor, cursor + 11), "ascii")
    const type = String.fromCharCode(bytes[cursor + 11] ?? 0)
    const length = bytes[cursor + 16] ?? 0
    fields.push({ name, type, length, offset: valueOffset })
    valueOffset += length
    cursor += 32
  }
  const rows: Record<string, string | number | boolean>[] = []
  for (let index = 0; index < count; index += 1) {
    const start = headerSize + index * recordSize
    if (bytes[start] === 0x2a) {
      rows.push({})
      continue
    }
    const row: Record<string, string | number | boolean> = {}
    for (const field of fields) {
      const raw = decode(bytes.subarray(start + field.offset, start + field.offset + field.length), encoding)
      if (!raw) continue
      if (field.type === "N" || field.type === "F") {
        const value = Number(raw)
        if (Number.isFinite(value)) row[field.name] = value
      } else if (field.type === "L") row[field.name] = raw === "Y" || raw === "T"
      else row[field.name] = raw
    }
    rows.push(row)
  }
  return rows
}

export function hasHighBytes(bytes: Uint8Array): boolean {
  const view = viewOf(bytes)
  const headerSize = view.getUint16(8, true)
  for (let index = headerSize; index < bytes.byteLength; index += 1) if ((bytes[index] ?? 0) > 127) return true
  return false
}
