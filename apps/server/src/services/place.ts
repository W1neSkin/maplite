const LOCALITY = ["city", "town", "village", "municipality", "hamlet"] as const

/** Settlement name only. The country makes the phone bar overflow. */
export function placeLabel(address: Record<string, unknown> | null | undefined): string {
  if (!address) return ""
  const text = (key: string) => (typeof address[key] === "string" ? address[key].trim() : "")
  const locality = LOCALITY.map(text).find(Boolean)
  if (locality) return locality
  const code = text("country_code").toUpperCase()
  return code || text("country")
}

const cache = new Map<string, { label: string; at: number }>()
let lastCall = 0

/** Nominatim allows about one request a second. Nearby taps share a cached label. */
export async function reversePlace(longitude: number, latitude: number, lang: string): Promise<string> {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)},${lang}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.label
  if (Date.now() - lastCall < 1100) return hit?.label ?? ""
  lastCall = Date.now()
  const url = new URL("https://nominatim.openstreetmap.org/reverse")
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("lat", String(latitude))
  url.searchParams.set("lon", String(longitude))
  url.searchParams.set("zoom", "10")
  url.searchParams.set("accept-language", lang || "en")
  const response = await fetch(url, { headers: { "User-Agent": "CartographicWorkspace/0.1", Accept: "application/json" } })
  if (!response.ok) return ""
  const body = (await response.json()) as { address?: Record<string, unknown> }
  const label = placeLabel(body.address)
  cache.set(key, { label, at: Date.now() })
  return label
}
