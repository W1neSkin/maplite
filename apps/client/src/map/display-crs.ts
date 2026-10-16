import { crs84ToProjected, outsideArea, profileById, projectedToCrs84, type CrsProfile } from "@cartography/geo-core"

export type DisplayDatum = "web" | "SK42" | "SK95" | "GSK2011"

const KEY = "cartography.displayDatum"
const DATA = ["web", "SK42", "SK95", "GSK2011"] as const

export function readDisplayDatum(): DisplayDatum {
  try {
    const value = localStorage.getItem(KEY)
    return DATA.includes(value as DisplayDatum) ? (value as DisplayDatum) : "web"
  } catch {
    return "web"
  }
}

export function writeDisplayDatum(datum: DisplayDatum): void {
  try {
    localStorage.setItem(KEY, datum)
  } catch {
    // Private mode can refuse storage. The choice still lasts for this visit.
  }
}

/** Gauss-Kruger zone number for a longitude. Zone 7 covers 36° to 42° east. */
export function zoneNumber(longitude: number): number {
  const east = ((longitude % 360) + 360) % 360
  return Math.floor(east / 6) + 1
}

export function zoneProfile(datum: Exclude<DisplayDatum, "web">, longitude: number, latitude: number): { profile: CrsProfile; outside: boolean } | null {
  const profile = profileById(`${datum.toLowerCase()}-gk6-z${zoneNumber(longitude)}`)
  if (!profile) return null
  return { profile, outside: outsideArea(longitude, latitude, profile) }
}

/** Truncated easting drops the zone millions so the phone bar stays short. */
export function toZonePair(coordinate: [number, number], profile: CrsProfile): [number, number] {
  const projected = crs84ToProjected(coordinate, profile, { notation: "truncated" }).coordinate
  return [Math.round(projected[0]), Math.round(projected[1])]
}

export function fromZonePair(easting: number, northing: number, profile: CrsProfile): [number, number] {
  const result = projectedToCrs84([easting, northing], profile, { notation: "truncated" })
  return [result.coordinate[0], result.coordinate[1]]
}
