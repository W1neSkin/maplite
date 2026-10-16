export const SCHEMA_VERSION = 1

export type GeometryType = "Point" | "LineString" | "Polygon"

/** Who wrote a record. The main window is the browser; a device is the phone app. */
export type EditOrigin = {
  surface: "main" | "device"
  deviceId: string
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type Crs84Geometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Polygon"; coordinates: [number, number][][] }

export type LayerStyle = {
  color: string
  fillOpacity: number
  strokeWidth: number
  labelAttribute: string | null
}

export type LayerSourceMetadata = {
  format: "shapefile" | "geojson" | "gps" | "derived" | "archive"
  originalName?: string
  crsWkt?: string
  crsProfileId?: string
  operationId?: string
  encoding?: string
  fieldMap?: Record<string, string>
}

export type Layer = {
  id: string
  projectId: string
  groupId: string | null
  name: string
  geometryType: GeometryType
  style: LayerStyle
  source: LayerSourceMetadata | null
  status: "importing" | "ready"
  derivedFrom?: { layerId: string; pointIds: string[] }
  order: number
}

export type LayerGroup = {
  id: string
  projectId: string
  name: string
  order: number
}

export type Feature = {
  id: string
  projectId: string
  layerId: string
  geometry: Crs84Geometry
  properties: Record<string, JsonValue>
  createdBy?: EditOrigin
  updatedBy?: EditOrigin
  deletedBy?: EditOrigin
  sourceGeometry?: {
    coordinates: JsonValue
    crsProfileId: string
    registrationVersion?: number
  }
}

export type ProjectSettings = {
  id: string
  projectId: string
  name: string
  defaultCrsProfileId: string | null
  defaultOperationId: string | null
}

export type ControlPoint = {
  id: string
  projectId: string
  networkId: string
  name: string
  x: number
  y: number
  easting: number
  northing: number
  weight: number
  role: "fit" | "check"
  source: "typed" | "imported" | "gps" | "map"
  note: string
}

export type ControlNetwork = {
  id: string
  projectId: string
  name: string
  targetCrsProfileId: string
  version: number
  tx: number | null
  ty: number | null
  scale: number | null
  rotationRad: number | null
  ppm: number | null
  rmsM: number | null
  maxResidualM: number | null
}

export type CustomOperation = {
  id: string
  projectId: string
  name: string
  sourceDatum: "SK42" | "SK95" | "GSK2011"
  dx: number
  dy: number
  dz: number
  rxArcsec: number
  ryArcsec: number
  rzArcsec: number
  scalePpm: number
  convention: "coordinate_frame" | "position_vector"
  accuracyM: number | null
  sourceNote: string
}

export type LiveObject = {
  id: string
  projectId: string
  name: string
  symbolId: string
  status: string
  deviceId: string | null
}

export type EntityType =
  | "projectSettings"
  | "layerGroup"
  | "layer"
  | "feature"
  | "controlNetwork"
  | "controlPoint"
  | "customOperation"
  | "liveObject"

export type EntityMap = {
  projectSettings: ProjectSettings
  layerGroup: LayerGroup
  layer: Layer
  feature: Feature
  controlNetwork: ControlNetwork
  controlPoint: ControlPoint
  customOperation: CustomOperation
  liveObject: LiveObject
}

export const ENTITY_TYPES: readonly EntityType[] = [
  "projectSettings",
  "layerGroup",
  "layer",
  "feature",
  "controlNetwork",
  "controlPoint",
  "customOperation",
  "liveObject",
]

export function entityProjectId(payload: { projectId?: string }): string | null {
  return payload.projectId ?? null
}
