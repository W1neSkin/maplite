import { describe, expect, it } from "vitest"
import { byWalk, movedIds } from "../src/app/walk.js"

describe("walk order", () => {
  it("keeps an unnumbered list and puts a new point after numbered ones", () => {
    const points = [
      { properties: { walk: 1 } },
      { properties: {} },
      { properties: { walk: 0 } },
    ]
    const names = [...points].sort(byWalk)
    expect(names.map((point) => point.properties.walk)).toEqual([0, 1, undefined])
  })

  it("moves one step and refuses the ends", () => {
    expect(movedIds(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"])
    expect(movedIds(["a", "b", "c"], "a", -1)).toBeNull()
    expect(movedIds(["a", "b", "c"], "c", 1)).toBeNull()
  })
})
