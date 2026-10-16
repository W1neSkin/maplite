import { describe, expect, it } from "vitest"
import { measureLabel } from "../src/app/measure-label.js"

describe("feature measure", () => {
  it("gives a line its length and a point nothing", () => {
    expect(measureLabel({ type: "Point", coordinates: [0, 0] })).toBeNull()
    expect(measureLabel({ type: "LineString", coordinates: [[0, 0], [0, 1]] })).toMatch(/^Length \d/)
  })

  it("withholds the area when the outline crosses itself", () => {
    const label = measureLabel({
      type: "Polygon",
      coordinates: [[[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]],
    })
    expect(label).toContain("Outline crosses itself")
    expect(label).not.toMatch(/ha|km²|m²/)
  })
})
