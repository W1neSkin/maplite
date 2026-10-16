import { describe, expect, it } from "vitest"
import { isPrecise, positionProblem } from "../src/map/position.js"

describe("position", () => {
  it("tells a refusal from a missing fix", () => {
    expect(positionProblem(1)).toBe("denied")
    expect(positionProblem(2)).toBe("waiting")
    expect(positionProblem(3)).toBe("waiting")
    expect(positionProblem(undefined)).toBe("waiting")
  })

  it("treats a wide reported radius as coarse", () => {
    expect(isPrecise(12)).toBe(true)
    expect(isPrecise(100)).toBe(true)
    expect(isPrecise(101)).toBe(false)
    expect(isPrecise(null)).toBe(true)
  })
})
