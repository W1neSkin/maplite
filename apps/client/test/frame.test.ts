import { describe, expect, it } from "vitest"
import { extentToScreen, frameFeature, paddingFromOverlays, panToCenterDelta } from "../src/map/frame.js"

const view = { width: 390, height: 700 }

describe("frameFeature", () => {
  it("leaves a feature that already sits inside the free area", () => {
    expect(frameFeature({ left: 80, top: 80, right: 110, bottom: 110 }, view, [40, 48, 200, 0], 8)).toEqual({ kind: "clear" })
  })

  it("pans the minimum distance when a point overlaps the bottom sheet", () => {
    // free bottom = 700 - 200 - 8 = 492. The point ends 8px below that.
    expect(frameFeature({ left: 180, top: 480, right: 208, bottom: 500 }, view, [40, 48, 200, 0], 8)).toEqual({ kind: "pan", dx: 0, dy: 8 })
  })

  it("pans a feature that is above the map back down", () => {
    // free top = 40 + 8 = 48. feature top is -20, so dy = -(48 - -20) = -68.
    expect(frameFeature({ left: 100, top: -20, right: 120, bottom: 0 }, view, [40, 48, 200, 0], 8)).toEqual({ kind: "pan", dx: 0, dy: -68 })
  })

  it("pans a feature out from under the right-hand zoom control", () => {
    // free right = 390 - 48 - 8 = 334.
    expect(frameFeature({ left: 300, top: 80, right: 360, bottom: 110 }, view, [36, 48, 80, 0], 8)).toEqual({ kind: "pan", dx: 26, dy: 0 })
  })

  it("pans a feature that is left of the free area", () => {
    expect(frameFeature({ left: -10, top: 90, right: 20, bottom: 120 }, view, [40, 48, 200, 16], 8)).toEqual({ kind: "pan", dx: -34, dy: 0 })
  })

  it("zooms out when a line is taller than the free area", () => {
    expect(frameFeature({ left: 40, top: 0, right: 300, bottom: 680 }, view, [40, 48, 220, 0], 8)).toEqual({ kind: "zoom-out" })
  })

  it("zooms out when a polygon is wider than the free area", () => {
    expect(frameFeature({ left: 0, top: 80, right: 380, bottom: 200 }, view, [40, 80, 200, 40], 8)).toEqual({ kind: "zoom-out" })
  })

  it("zooms out when the overlays leave no free area", () => {
    expect(frameFeature({ left: 10, top: 10, right: 20, bottom: 20 }, view, [400, 0, 400, 0], 8)).toEqual({ kind: "zoom-out" })
  })
})

describe("panToCenterDelta", () => {
  it("subtracts a positive screen dy from map y", () => {
    expect(panToCenterDelta(10, 32, 2)).toEqual([20, -64])
  })
})

describe("extentToScreen", () => {
  it("maps upward map y to a smaller screen y", () => {
    const box = extentToScreen([0, 10, 0, 10], [0, 0], 2, [200, 100])
    expect(box.left).toBeCloseTo(100)
    expect(box.top).toBeCloseTo(45)
    expect(box.bottom).toBeCloseTo(45)
  })
})

describe("paddingFromOverlays", () => {
  it("insets the sheet from the bottom and the zoom control from the top and right", () => {
    const stage = { left: 10, top: 30, right: 400, bottom: 874 }
    const padding = paddingFromOverlays(stage, [
      { left: 22, top: 530, right: 388, bottom: 810 },
      { left: 165, top: 820, right: 245, bottom: 852 },
      { left: 350, top: 42, right: 388, bottom: 114 },
    ])
    expect(padding).toEqual([84, 50, 344, 0])
  })
})
