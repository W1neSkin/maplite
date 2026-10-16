import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CRS_PROFILES,
  OPERATIONS,
  crs84ToProjected,
  fromEpsgAxisOrder,
  operationById,
  profileById,
  profilesForDatum,
  projectedToCrs84,
  sourceGeographicToCrs84,
  toEpsgAxisOrder,
} from "../src/index.js"

type GeographicRow = {
  datum: "SK42" | "SK95" | "GSK2011"
  lat: number
  lon: number
  wgsLat: number
  wgsLon: number
  backLat: number
  backLon: number
}

type ProjectedRow = {
  datum: "SK42" | "SK95" | "GSK2011"
  zone: number
  lat: number
  lon: number
  northing: number
  easting: number
  backLat: number
  backLon: number
  tag: string
}

const golden = JSON.parse(readFileSync(new URL("./fixtures/proj-golden.json", import.meta.url), "utf8")) as {
  geographic: GeographicRow[]
  projected: ProjectedRow[]
}

const operationFor = {
  SK42: "epsg-5044",
  SK95: "epsg-5043",
  GSK2011: "epsg-9773",
} as const

describe("catalog", () => {
  it("keeps only 6° zones that meet the published area of use", () => {
    for (const datum of ["SK42", "SK95", "GSK2011"] as const) {
      const zones = profilesForDatum(datum).map((profile) => profile.zone)
      expect(zones[0]).toBe(4)
      expect(zones[zones.length - 1]).toBe(32)
      expect(zones).not.toContain(3)
    }
    expect(profileById("sk42-gk6-z7")?.epsg).toBe(28407)
    expect(profileById("sk95-gk6-z7")?.falseEasting).toBe(7_500_000)
    expect(OPERATIONS).toHaveLength(3)
  })
})

describe("datum operations against PROJ 9.4", () => {
  it.each(golden.geographic)("$datum $lat $lon", (row) => {
    const operation = operationById(operationFor[row.datum])!
    const forward = sourceGeographicToCrs84(row.lon, row.lat, operation)
    expect(forward[1]).toBeCloseTo(row.wgsLat, 7)
    expect(forward[0]).toBeCloseTo(row.wgsLon, 7)
    const profile = profileById(`${row.datum.toLowerCase()}-gk6-z7`)!
    const back = crs84ToProjected(forward, profile)
    const again = projectedToCrs84(back.coordinate, profile)
    expect(again.coordinate[1]).toBeCloseTo(forward[1], 7)
    expect(again.coordinate[0]).toBeCloseTo(forward[0], 7)
  })
})

function insidePublishedArea(datum: GeographicRow["datum"], latitude: number, longitude: number): boolean {
  const area = operationById(operationFor[datum])!.area
  if (latitude < area.south || latitude > area.north) return false
  if (area.west <= area.east) return longitude >= area.west && longitude <= area.east
  return longitude >= area.west || longitude <= area.east
}

describe("Gauss-Kruger against PROJ 9.4", () => {
  it.each(golden.projected)("$datum zone $zone $tag", (row) => {
    const profile = CRS_PROFILES.find((item) => item.datum === row.datum && item.zone === row.zone)!
    const forward = projectedToCrs84(fromEpsgAxisOrder(row.northing, row.easting), profile)
    // Points outside the published datum area are still computable, but PROJ may
    // choose another operation there. Strict agreement is required only inside it.
    const inside = insidePublishedArea(row.datum, row.lat, row.lon)
    const decimals = inside ? 6 : 4
    expect(forward.coordinate[1]).toBeCloseTo(row.backLat, decimals)
    expect(forward.coordinate[0]).toBeCloseTo(row.backLon, decimals)
    const inverse = crs84ToProjected([row.lon, row.lat], profile)
    const [northing, easting] = toEpsgAxisOrder(inverse.coordinate)
    // Outside the published datum area PROJ may use another operation.
    // A few metres is still a projection, not a wrong zone.
    const metreSlack = inside ? 0.005 : 5
    expect(Math.abs(easting - row.easting)).toBeLessThan(metreSlack)
    expect(Math.abs(northing - row.northing)).toBeLessThan(metreSlack)
    const truncated = crs84ToProjected([row.lon, row.lat], profile, { notation: "truncated" })
    expect(Math.abs(truncated.coordinate[0] - (row.easting - row.zone * 1_000_000))).toBeLessThan(metreSlack)
    const fromTruncated = projectedToCrs84(truncated.coordinate, profile, { notation: "truncated" })
    expect(fromTruncated.coordinate[1]).toBeCloseTo(row.lat, 6)
    expect(fromTruncated.coordinate[0]).toBeCloseTo(row.lon, 6)
  })

  it("flags a coordinate outside the zone", () => {
    const profile = profileById("sk42-gk6-z7")!
    const result = crs84ToProjected([37.6, 10], profile)
    expect(result.outsideAreaOfUse).toBe(true)
  })
})
