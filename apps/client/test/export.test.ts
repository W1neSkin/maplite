import { describe, expect, it } from "vitest"
import type { Feature } from "@cartography/project-schema"
import { loadBytes } from "../src/import/load.js"
import { layerZip } from "../src/import/write-shp.js"

function point(name: string, longitude: number, latitude: number): Feature {
  return {
    id: "point-1",
    projectId: "p",
    layerId: "layer-1",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: { name, note: "gate" },
  }
}

describe("layerZip", () => {
  it("writes a WGS 84 zip that imports back with the same point", () => {
    const file = layerZip("Points of interest", "Point", [point("North gate", -0.16, 51.51)])
    expect(file.filename).toBe("Points_of_interest.zip")
    const loaded = loadBytes(file.filename, file.bytes)
    expect(loaded.kind).toBe("ready")
    if (loaded.kind !== "ready") return
    expect(loaded.features[0]?.name).toBe("North gate")
    expect(loaded.features[0]?.properties.NOTE).toBe("gate")
    const [longitude, latitude] = loaded.features[0]?.geometry.coordinates as [number, number]
    expect(longitude).toBeCloseTo(-0.16, 5)
    expect(latitude).toBeCloseTo(51.51, 5)
    expect(loaded.operationName).toBeNull()
  })
})
