import { describe, expect, it } from "vitest"
import { acceptedGeometry } from "../src/map/vertex-edit.js"

describe("edited geometry", () => {
  it("rounds a point and rejects a broken line", () => {
    expect(acceptedGeometry({ type: "Point", coordinates: [27.1234567, 53.9] })).toEqual({ type: "Point", coordinates: [27.123457, 53.9] })
    expect(acceptedGeometry({ type: "LineString", coordinates: [[1, 2]] })).toBeNull()
  })

  it("closes a polygon ring", () => {
    const geometry = acceptedGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1]]] })
    expect(geometry).toEqual({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] })
  })
})
