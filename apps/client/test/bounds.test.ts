import { describe, expect, it } from "vitest"
import { featureBounds } from "../src/map/bounds.js"
import type { MapFeature } from "../src/app/model.js"

function feature(geometry: MapFeature["geometry"]): MapFeature {
  return { id: "a", name: "A", layerId: "l", geometry, color: "#000", fillOpacity: 0, strokeWidth: 2, stack: 0, label: null }
}

describe("feature bounds", () => {
  it("wraps a line and ignores an empty list", () => {
    expect(featureBounds([])).toBeNull()
    expect(featureBounds([feature({ type: "LineString", coordinates: [[1, 2], [3, 4]] })])).toEqual([1, 2, 3, 4])
  })
})
