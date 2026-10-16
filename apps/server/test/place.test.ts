import { describe, expect, it } from "vitest"
import { placeLabel } from "../src/services/place.js"

describe("placeLabel", () => {
  it("keeps the line to a city and a country", () => {
    expect(placeLabel({ city: "London", road: "Baker Street", country: "United Kingdom" })).toBe("London, United Kingdom")
    expect(placeLabel({ village: "Hartfield", country: "United Kingdom" })).toBe("Hartfield, United Kingdom")
    expect(placeLabel({ country: "France" })).toBe("France")
    expect(placeLabel(undefined)).toBe("")
  })
})
