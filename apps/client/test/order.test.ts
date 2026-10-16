import { describe, expect, it } from "vitest"
import { anchorOf } from "../src/map/anchor.js"
import { moveItem } from "../src/app/order.js"

describe("moveItem", () => {
  it("moves a layer upward in the list", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"])
  })

  it("leaves the list alone when the index does not change", () => {
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"])
  })
})

describe("anchorOf", () => {
  it("uses the point itself and the middle of a line", () => {
    expect(anchorOf({ type: "Point", coordinates: [1, 2] })).toEqual([1, 2])
    expect(anchorOf({ type: "LineString", coordinates: [[0, 0], [2, 4]] })).toEqual([1, 2])
  })
})
