import { describe, expect, it } from "vitest"
import { accuracyRing, averagePositions, geodesicLength, measurePolygon } from "../src/index.js"

describe("geodesic measurements", () => {
  it("measures a kilometre-scale line and a polygon with a hole", () => {
    const length = geodesicLength([
      [37.6, 55.75],
      [37.62, 55.75],
    ])
    expect(length).toBeGreaterThan(1200)
    expect(length).toBeLessThan(1400)
    const outer = [
      [37.6, 55.75],
      [37.62, 55.75],
      [37.62, 55.76],
      [37.6, 55.76],
      [37.6, 55.75],
    ] as const
    const hole = [
      [37.605, 55.752],
      [37.608, 55.752],
      [37.608, 55.754],
      [37.605, 55.754],
      [37.605, 55.752],
    ] as const
    const solid = measurePolygon(outer)
    const withHole = measurePolygon(outer, [hole])
    expect(solid.areaM2).toBeGreaterThan(1_000_000)
    expect(withHole.areaM2!).toBeLessThan(solid.areaM2!)
    expect(withHole.selfIntersecting).toBe(false)
  })

  it("keeps an accuracy ring on the ellipsoid", () => {
    const center: [number, number] = [27.5, 53.9]
    const ring = accuracyRing(center, 100, 8)
    expect(ring).toHaveLength(9)
    expect(ring[0]).toEqual(ring[8])
    for (const point of ring.slice(0, -1)) {
      const distance = geodesicLength([center, point])
      expect(distance).toBeGreaterThan(99)
      expect(distance).toBeLessThan(101)
    }
  })

  it("does not publish an ordinary area for a bow-tie", () => {
    const bowtie = measurePolygon([
      [0, 0],
      [1, 1],
      [0, 1],
      [1, 0],
      [0, 0],
    ])
    expect(bowtie.selfIntersecting).toBe(true)
    expect(bowtie.areaM2).toBeNull()
  })

  it("keeps a polygon that crosses the antimeridian", () => {
    const measured = measurePolygon([
      [179.5, 10],
      [-179.5, 10],
      [-179.5, 10.2],
      [179.5, 10.2],
      [179.5, 10],
    ])
    expect(measured.selfIntersecting).toBe(false)
    expect(measured.areaM2).toBeGreaterThan(1_000_000)
  })
})

describe("position averaging", () => {
  it("rejects a coarse fix and a far outlier, then reports scatter", () => {
    const now = 1_700_000_000_000
    const result = averagePositions(
      [
        { id: "a", coordinate: [37.6, 55.75], sampledAtMs: now, precise: true, horizontalAccuracyM: 5 },
        { id: "b", coordinate: [37.60002, 55.75], sampledAtMs: now + 1000, precise: true, horizontalAccuracyM: 5 },
        { id: "c", coordinate: [37.60001, 55.75001], sampledAtMs: now + 2000, precise: true, horizontalAccuracyM: 4 },
        { id: "d", coordinate: [37.61, 55.76], sampledAtMs: now + 2500, precise: true, horizontalAccuracyM: 5 },
        { id: "e", coordinate: [37.6, 55.75], sampledAtMs: now + 3000, precise: false, horizontalAccuracyM: 100 },
        { id: "a", coordinate: [38, 56], sampledAtMs: now + 4000, precise: true, horizontalAccuracyM: 1 },
      ],
      { nowMs: now + 4000, maxAgeMs: 10_000 },
    )
    expect(result).not.toBeNull()
    expect(result!.count).toBe(3)
    expect(result!.rejected).toBe(1)
    expect(result!.coordinate[0]).toBeGreaterThan(37.6)
    expect(result!.coordinate[0]).toBeLessThan(37.601)
    expect(result!.rmsScatterM).toBeLessThan(5)
  })
})
