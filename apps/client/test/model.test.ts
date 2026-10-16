import { describe, expect, it } from "vitest"
import type { SnapshotResponse } from "@cartography/project-schema"
import { buildMapModel, projectName } from "../src/app/model.js"
import { screenNotice } from "../src/app/screen.js"
import { formatArea, formatDecimalDegrees, formatDms, formatLength, formatSpeed, formatWhen } from "../src/i18n/format.js"

const snapshot: SnapshotResponse = {
  entities: [
    {
      entityType: "projectSettings",
      entityId: "settings",
      version: 1,
      deleted: false,
      payload: { id: "settings", projectId: "p", name: "Demo", defaultCrsProfileId: null, defaultOperationId: null },
    },
    {
      entityType: "layer",
      entityId: "ready",
      version: 1,
      deleted: false,
      payload: {
        id: "ready",
        projectId: "p",
        groupId: null,
        name: "Points of interest",
        geometryType: "Point",
        style: { color: "#1f4d3a", fillOpacity: 0, strokeWidth: 2, labelAttribute: "name" },
        source: null,
        status: "ready",
        order: 1,
      },
    },
    {
      entityType: "layer",
      entityId: "hidden",
      version: 1,
      deleted: false,
      payload: {
        id: "hidden",
        projectId: "p",
        groupId: null,
        name: "Incoming",
        geometryType: "Point",
        style: { color: "#000000", fillOpacity: 0, strokeWidth: 2, labelAttribute: null },
        source: null,
        status: "importing",
        order: 0,
      },
    },
    {
      entityType: "feature",
      entityId: "gate",
      version: 1,
      deleted: false,
      payload: {
        id: "gate",
        projectId: "p",
        layerId: "ready",
        geometry: { type: "Point", coordinates: [-0.17, 51.51] },
        properties: { name: "North gate" },
      },
    },
    {
      entityType: "feature",
      entityId: "secret",
      version: 1,
      deleted: false,
      payload: {
        id: "secret",
        projectId: "p",
        layerId: "hidden",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: { name: "Hidden" },
      },
    },
  ],
  nextCursor: null,
  hasMore: false,
  watermark: 4,
  schemaVersion: 1,
}

describe("map model", () => {
  it("shows ready layers and keeps an importing layer off the map", () => {
    const model = buildMapModel(snapshot)
    expect(projectName(snapshot)).toBe("Demo")
    expect(model.layers.map((layer) => layer.name)).toEqual(["Points of interest"])
    expect(model.layers[0]?.color).toBe("#1f4d3a")
    expect(model.features[0]?.color).toBe("#1f4d3a")
    expect(model.features[0]?.label).toBe("North gate")
    expect(model.layers[0]?.labelAttribute).toBe("name")
    expect(model.features.map((feature) => feature.name)).toEqual(["North gate"])
  })

  it("keeps server failure and an empty project distinct from a missing basemap", () => {
    expect(screenNotice({ loading: true, failed: false, featureCount: 0 })).toBe("loading")
    expect(screenNotice({ loading: false, failed: true, featureCount: 3 })).toBe("server")
    expect(screenNotice({ loading: false, failed: false, featureCount: 0 })).toBe("empty")
    expect(screenNotice({ loading: false, failed: false, featureCount: 2 })).toBe("ready")
  })
})

describe("format", () => {
  it("uses metric units and decimal degrees", () => {
    expect(formatLength(1250)).toBe("1.25 km")
    expect(formatLength(12)).toBe("12 m")
    expect(formatArea(20_000)).toBe("2 ha")
    expect(formatSpeed(10)).toBe("36 km/h")
    expect(formatDecimalDegrees(-0.175)).toBe("-0.175°")
    expect(formatDms(-0.5)).toBe("-0° 30′ 0″")
    expect(formatWhen("not-a-date")).toBe("not-a-date")
    expect(formatWhen("2026-01-02T15:04:00Z").length).toBeGreaterThan(0)
  })
})
