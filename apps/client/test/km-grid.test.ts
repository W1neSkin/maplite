import { describe, expect, it } from "vitest"
import { gridStep } from "../src/map/km-grid.js"

describe("kilometre grid", () => {
  it("uses a coarser step as the view gets wider", () => {
    expect(gridStep(5_000)).toBe(1_000)
    expect(gridStep(40_000)).toBe(5_000)
    expect(gridStep(100_000)).toBe(10_000)
  })
})
