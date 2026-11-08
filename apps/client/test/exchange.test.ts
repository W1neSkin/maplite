import { describe, expect, it } from "vitest"
import { layerGpx, layerKml, loadTrackText } from "../src/import/gpx-kml.js"
import { viewTileKeys } from "../src/map/tile-cache.js"

describe("gpx and kml", () => {
  const point = { name: "Gate", geometry: { type: "Point" as const, coordinates: [27.5, 53.9] as [number, number] } }
  const line = { name: "Path", geometry: { type: "LineString" as const, coordinates: [[27.5, 53.9], [27.6, 53.91]] as [number, number][] } }

  it("round-trips a point and a line", () => {
    const gpx = loadTrackText("marks.gpx", layerGpx("marks", [point]).text)
    expect(gpx.kind).toBe("ready")
    if (gpx.kind === "ready") expect(gpx.features[0]?.geometry).toEqual(point.geometry)
    const kml = loadTrackText("path.kml", layerKml("path", [line]).text)
    expect(kml.kind).toBe("ready")
    if (kml.kind === "ready") expect(kml.features[0]?.name).toBe("Path")
  })
})

describe("visible map tiles", () => {
  it("covers a small screen and refuses the whole world", () => {
    const close = viewTileKeys([27.55, 53.9], [27.57, 53.91], 16)
    expect(close.length).toBeGreaterThan(0)
    expect(close.length).toBeLessThanOrEqual(49)
    expect(close.every((key) => key.startsWith("16/"))).toBe(true)
    expect(viewTileKeys([-180, -80], [180, 80], 4).length).toBeLessThanOrEqual(49)
  })
})
