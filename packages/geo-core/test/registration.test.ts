import { describe, expect, it } from "vitest"
import { GeoError, applySimilarity, networkRelation, solveSimilarity } from "../src/index.js"

describe("similarity registration", () => {
  it("uses translation only for one point", () => {
    const solution = solveSimilarity([
      { id: "a", x: 5, y: 6, easting: 15, northing: 26, role: "fit" },
    ])
    expect(solution.similarity.scale).toBe(1)
    expect(solution.similarity.rotationRad).toBe(0)
    expect(applySimilarity(0, 0, solution.similarity)).toEqual([10, 20])
    expect(solution.rmsM).toBe(0)
  })

  it("fits two points exactly and does not treat a zero residual as a check", () => {
    const solution = solveSimilarity([
      { id: "a", x: 0, y: 0, easting: 100, northing: 200, role: "fit" },
      { id: "b", x: 10, y: 0, easting: 100, northing: 210, role: "fit" },
    ])
    expect(solution.exact).toBe(true)
    expect(solution.rmsM).toBeCloseTo(0, 8)
    expect(solution.similarity.scale).toBeCloseTo(1, 8)
    expect(solution.similarity.rotationRad).toBeCloseTo(Math.PI / 2, 8)
  })

  it("recovers a noisy three-point network and keeps check points out of the fit", () => {
    const similarity = { tx: 1000, ty: 2000, scale: 1.00002, rotationRad: 0.01, ppm: 20 }
    const locals = [
      [0, 0],
      [100, 0],
      [0, 80],
      [40, 40],
    ] as const
    const points = locals.map(([x, y], index) => {
      const [easting, northing] = applySimilarity(x, y, similarity)
      return {
        id: `p${index}`,
        x,
        y,
        easting: easting + (index === 3 ? 0.4 : 0),
        northing,
        role: index === 3 ? ("check" as const) : ("fit" as const),
      }
    })
    const solution = solveSimilarity(points)
    expect(solution.similarity.tx).toBeCloseTo(1000, 6)
    expect(solution.similarity.scale).toBeCloseTo(1.00002, 8)
    expect(solution.residuals.find((residual) => residual.id === "p3")!.horizontalM).toBeGreaterThan(0.3)
    expect(solution.checkCount).toBe(1)
    const inside = networkRelation([points[0]!.easting + 10, points[0]!.northing + 10], solution.hull)
    expect(inside.inside).toBe(true)
    const outside = networkRelation([0, 0], solution.hull)
    expect(outside.inside).toBe(false)
  })

  it("accepts a long collinear chain because similarity does not need an area", () => {
    const solution = solveSimilarity([
      { id: "a", x: 0, y: 0, easting: 0, northing: 0, role: "fit" },
      { id: "b", x: 10, y: 0, easting: 20, northing: 0, role: "fit" },
      { id: "c", x: 20, y: 0, easting: 40, northing: 0, role: "fit" },
    ])
    expect(solution.similarity.scale).toBeCloseTo(2, 8)
    expect(solution.rmsM).toBeCloseTo(0, 8)
  })

  it("rejects a short baseline and duplicate points", () => {
    expect(() =>
      solveSimilarity([
        { id: "a", x: 0, y: 0, easting: 0, northing: 0, role: "fit" },
        { id: "b", x: 0.2, y: 0, easting: 0.2, northing: 0, role: "fit" },
      ]),
    ).toThrow(GeoError)
    expect(() =>
      solveSimilarity([
        { id: "a", x: 0, y: 0, easting: 5, northing: 5, role: "fit" },
        { id: "b", x: 0, y: 0, easting: 5, northing: 6, role: "fit" },
        { id: "c", x: 0, y: 0, easting: 6, northing: 5, role: "fit" },
      ]),
    ).toThrow(GeoError)
  })
})
