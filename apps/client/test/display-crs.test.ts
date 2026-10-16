import { describe, expect, it } from "vitest"
import { fromZonePair, toZonePair, zoneNumber, zoneProfile } from "../src/map/display-crs.js"

describe("display CRS", () => {
  it("puts 36° east in Gauss-Kruger zone 7", () => {
    expect(zoneNumber(36.1)).toBe(7)
    expect(zoneProfile("SK42", 36.1, 55)?.profile.id).toBe("sk42-gk6-z7")
    expect(zoneProfile("SK42", -0.16, 51.5)).toBeNull()
  })

  it("round-trips a truncated zone coordinate back to longitude and latitude", () => {
    const zone = zoneProfile("SK42", 36.1, 55)
    if (!zone) throw new Error("missing zone")
    const shown = toZonePair([36.1, 55], zone.profile)
    const back = fromZonePair(shown[0], shown[1], zone.profile)
    expect(back[0]).toBeCloseTo(36.1, 3)
    expect(back[1]).toBeCloseTo(55, 3)
  })
})
