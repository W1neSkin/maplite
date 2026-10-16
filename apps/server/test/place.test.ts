import { describe, expect, it } from "vitest"
import { placeLabel } from "../src/services/place.js"

describe("placeLabel", () => {
  it("uses the settlement and skips the country", () => {
    expect(placeLabel({ city: "London", road: "Baker Street", country: "United Kingdom" })).toBe("London")
    expect(placeLabel({ village: "Hartfield", country: "United Kingdom" })).toBe("Hartfield")
    expect(placeLabel({ country: "France", country_code: "fr" })).toBe("FR")
    expect(placeLabel(undefined)).toBe("")
  })
})
