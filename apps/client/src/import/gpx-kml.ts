import type { Crs84Geometry } from "@cartography/project-schema"
import type { ImportOutcome } from "./load.js"

type Row = {
  name: string
  geometry: Crs84Geometry
  properties: Record<string, string | number | boolean>
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function pairsOf(geometry: Crs84Geometry): [number, number][] {
  if (geometry.type === "Point") return [geometry.coordinates]
  if (geometry.type === "LineString") return geometry.coordinates
  return geometry.coordinates[0] ?? []
}

export function layerGpx(name: string, features: readonly { name: string; geometry: Crs84Geometry }[]): { filename: string; text: string } {
  const body = features.map((feature) => {
    const title = escapeXml(feature.name)
    if (feature.geometry.type === "Point") {
      const [lon, lat] = feature.geometry.coordinates
      return `<wpt lat="${lat}" lon="${lon}"><name>${title}</name></wpt>`
    }
    const points = pairsOf(feature.geometry).map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"></trkpt>`).join("")
    return `<trk><name>${title}</name><trkseg>${points}</trkseg></trk>`
  }).join("")
  return { filename: `${name}.gpx`, text: `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="MapLite">${body}</gpx>` }
}

export function layerKml(name: string, features: readonly { name: string; geometry: Crs84Geometry }[]): { filename: string; text: string } {
  const marks = features.map((feature) => {
    const title = escapeXml(feature.name)
    if (feature.geometry.type === "Point") {
      const [lon, lat] = feature.geometry.coordinates
      return `<Placemark><name>${title}</name><Point><coordinates>${lon},${lat}</coordinates></Point></Placemark>`
    }
    const line = pairsOf(feature.geometry).map(([lon, lat]) => `${lon},${lat}`).join(" ")
    if (feature.geometry.type === "LineString") {
      return `<Placemark><name>${title}</name><LineString><coordinates>${line}</coordinates></LineString></Placemark>`
    }
    return `<Placemark><name>${title}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${line}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`
  }).join("")
  return { filename: `${name}.kml`, text: `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapeXml(name)}</name>${marks}</Document></kml>` }
}

function numberAttr(tag: string, name: string): number | null {
  const match = new RegExp(`${name}="([^"]+)"`).exec(tag)
  const value = match ? Number(match[1]) : NaN
  return Number.isFinite(value) ? value : null
}

function tagName(block: string, fallback: string): string {
  const match = /<name>([^<]*)<\/name>/.exec(block)
  return match?.[1]?.trim() || fallback
}

function ready(name: string, rows: Row[]): ImportOutcome {
  if (rows.length === 0) return { kind: "blocked", code: "empty" }
  const geometryType = rows[0]?.geometry.type
  if (!geometryType || rows.some((row) => row.geometry.type !== geometryType)) return { kind: "blocked", code: "mixed" }
  return { kind: "ready", name, geometryType, count: rows.length, operationName: null, accuracyM: null, outside: false, features: rows, crsWkt: null, operationId: null, profileId: null }
}

function fromGpx(name: string, body: string): ImportOutcome {
  const rows: Row[] = []
  for (const block of body.match(/<wpt\b[\s\S]*?<\/wpt>/gi) ?? []) {
    const lat = numberAttr(block, "lat")
    const lon = numberAttr(block, "lon")
    if (lat == null || lon == null) continue
    const title = tagName(block, `Point ${rows.length + 1}`)
    rows.push({ name: title, geometry: { type: "Point", coordinates: [lon, lat] }, properties: { name: title } })
  }
  if (rows.length > 0) return ready(name.replace(/\.gpx$/i, ""), rows)
  const tracks: Row[] = []
  for (const block of body.match(/<trk\b[\s\S]*?<\/trk>/gi) ?? []) {
    const coordinates: [number, number][] = []
    for (const point of block.match(/<trkpt\b[^>]*>/gi) ?? []) {
      const lat = numberAttr(point, "lat")
      const lon = numberAttr(point, "lon")
      if (lat != null && lon != null) coordinates.push([lon, lat])
    }
    if (coordinates.length < 2) continue
    const title = tagName(block, `Track ${tracks.length + 1}`)
    tracks.push({ name: title, geometry: { type: "LineString", coordinates }, properties: { name: title } })
  }
  return ready(name.replace(/\.gpx$/i, ""), tracks)
}

function coordinateList(text: string): [number, number][] {
  const pairs: [number, number][] = []
  for (const item of text.trim().split(/\s+/)) {
    const [lon, lat] = item.split(",").map(Number)
    if (Number.isFinite(lon) && Number.isFinite(lat)) pairs.push([lon, lat])
  }
  return pairs
}

function fromKml(name: string, body: string): ImportOutcome {
  const rows: Row[] = []
  for (const block of body.match(/<Placemark\b[\s\S]*?<\/Placemark>/gi) ?? []) {
    const title = tagName(block, `Feature ${rows.length + 1}`)
    const point = /<Point\b[\s\S]*?<coordinates>([^<]*)<\/coordinates>/i.exec(block)
    if (point?.[1]) {
      const pair = coordinateList(point[1])[0]
      if (pair) rows.push({ name: title, geometry: { type: "Point", coordinates: pair }, properties: { name: title } })
      continue
    }
    const line = /<LineString\b[\s\S]*?<coordinates>([^<]*)<\/coordinates>/i.exec(block)
    if (line?.[1]) {
      const coordinates = coordinateList(line[1])
      if (coordinates.length >= 2) rows.push({ name: title, geometry: { type: "LineString", coordinates }, properties: { name: title } })
      continue
    }
    const ring = /<Polygon\b[\s\S]*?<coordinates>([^<]*)<\/coordinates>/i.exec(block)
    if (ring?.[1]) {
      const coordinates = coordinateList(ring[1])
      if (coordinates.length >= 4) rows.push({ name: title, geometry: { type: "Polygon", coordinates: [coordinates] }, properties: { name: title } })
    }
  }
  return ready(name.replace(/\.kml$/i, ""), rows)
}

export function loadTrackText(name: string, body: string): ImportOutcome {
  if (/\.kml$/i.test(name) || /<kml[\s>]/i.test(body)) return fromKml(name, body)
  return fromGpx(name, body)
}
