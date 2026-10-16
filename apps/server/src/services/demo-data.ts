import type { Feature, Layer, LayerGroup, ProjectSettings } from "@cartography/project-schema"

/**
 * Sample places in Hyde Park, London.
 * Coordinates are OGC:CRS84: longitude, then latitude.
 */
export const DEMO_PROJECT_ID = "0199a1b2-c3d4-7000-8000-000000000001"

const settingsId = "0199a1b2-c3d4-7000-8000-000000000002"
const groupId = "0199a1b2-c3d4-7000-8000-000000000003"
const pointsLayerId = "0199a1b2-c3d4-7000-8000-000000000004"
const routeLayerId = "0199a1b2-c3d4-7000-8000-000000000005"
const areaLayerId = "0199a1b2-c3d4-7000-8000-000000000006"

const northGate: [number, number] = [-0.175, 51.511]
const boathouse: [number, number] = [-0.166, 51.505]
const eastShelter: [number, number] = [-0.155, 51.508]

export type DemoRecord =
  | { entityType: "projectSettings"; entityId: string; payload: ProjectSettings }
  | { entityType: "layerGroup"; entityId: string; payload: LayerGroup }
  | { entityType: "layer"; entityId: string; payload: Layer }
  | { entityType: "feature"; entityId: string; payload: Feature }

function style(color: string, fillOpacity: number, strokeWidth = 2): Layer["style"] {
  return { color, fillOpacity, strokeWidth, labelAttribute: null }
}

function layer(id: string, name: string, geometryType: Layer["geometryType"], order: number, color: string, fillOpacity: number, strokeWidth = 2): Layer {
  return {
    id,
    projectId: DEMO_PROJECT_ID,
    groupId,
    name,
    geometryType,
    style: style(color, fillOpacity, strokeWidth),
    source: null,
    status: "ready",
    order,
  }
}

export function buildDemoRecords(): DemoRecord[] {
  const ring: [number, number][] = [
    [-0.172, 51.506],
    [-0.162, 51.506],
    [-0.162, 51.509],
    [-0.172, 51.509],
    [-0.172, 51.506],
  ]
  return [
    {
      entityType: "projectSettings",
      entityId: settingsId,
      payload: {
        id: settingsId,
        projectId: DEMO_PROJECT_ID,
        name: "Demo",
        defaultCrsProfileId: null,
        defaultOperationId: null,
      },
    },
    {
      entityType: "layerGroup",
      entityId: groupId,
      payload: { id: groupId, projectId: DEMO_PROJECT_ID, name: "Sample", order: 0 },
    },
    {
      entityType: "layer",
      entityId: pointsLayerId,
      payload: layer(pointsLayerId, "Points of interest", "Point", 0, "#1f4d3a", 0),
    },
    {
      entityType: "layer",
      entityId: routeLayerId,
      payload: layer(routeLayerId, "Route", "LineString", 1, "#8a4b08", 0, 3),
    },
    {
      entityType: "layer",
      entityId: areaLayerId,
      payload: layer(areaLayerId, "Open ground", "Polygon", 2, "#1d4e89", 0.28),
    },
    feature("0199a1b2-c3d4-7000-8000-000000000007", pointsLayerId, "North gate", {
      type: "Point",
      coordinates: northGate,
    }),
    feature("0199a1b2-c3d4-7000-8000-000000000008", pointsLayerId, "Boathouse", {
      type: "Point",
      coordinates: boathouse,
    }),
    feature("0199a1b2-c3d4-7000-8000-000000000009", pointsLayerId, "East shelter", {
      type: "Point",
      coordinates: eastShelter,
    }),
    feature("0199a1b2-c3d4-7000-8000-00000000000a", routeLayerId, "Loop path", {
      type: "LineString",
      coordinates: [northGate, [-0.17, 51.508], boathouse, eastShelter],
    }),
    feature("0199a1b2-c3d4-7000-8000-00000000000b", areaLayerId, "Open ground", {
      type: "Polygon",
      coordinates: [ring],
    }),
  ]
}

function feature(id: string, layerId: string, name: string, geometry: Feature["geometry"]): DemoRecord {
  return {
    entityType: "feature",
    entityId: id,
    payload: { id, projectId: DEMO_PROJECT_ID, layerId, geometry, properties: { name } },
  }
}
