import type { Feature, Layer, SnapshotResponse } from "@cartography/project-schema"

export type MapLayer = {
  id: string
  name: string
  geometryType: Layer["geometryType"]
  color: string
  fillOpacity: number
  labelAttribute: string | null
  groupId: string | null
  count: number
  delivery: Layer["delivery"] | null
}

export type MapGroup = {
  id: string
  name: string
  order: number
}

export type MapFeature = {
  id: string
  name: string
  layerId: string
  geometry: Feature["geometry"]
  color: string
  fillOpacity: number
  strokeWidth: number
  stack: number
  label: string | null
  properties: Record<string, string | number | boolean>
}

export type MapModel = {
  layers: MapLayer[]
  groups: MapGroup[]
  features: MapFeature[]
}

function plainProperties(properties: Feature["properties"]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value
  }
  return out
}

function labelText(properties: Feature["properties"], key: string | null): string | null {
  if (!key) return null
  const value = properties[key]
  if (typeof value === "string") return value.trim() ? value : null
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return null
}

/** Importing layers stay hidden until their last update marks them ready. */
export function buildMapModel(snapshot: SnapshotResponse): MapModel {
  const layers = new Map<string, Layer>()
  for (const entity of snapshot.entities) {
    if (entity.deleted || entity.entityType !== "layer") continue
    const layer = entity.payload as Layer
    if (layer.status !== "ready") continue
    layers.set(layer.id, layer)
  }
  const groups: MapGroup[] = []
  for (const entity of snapshot.entities) {
    if (entity.deleted || entity.entityType !== "layerGroup") continue
    const group = entity.payload as { id: string; name: string; order: number }
    groups.push({ id: group.id, name: group.name, order: group.order })
  }
  groups.sort((a, b) => a.order - b.order)
  const ordered = [...layers.values()].sort((a, b) => a.order - b.order)
  const stackOf = new Map(ordered.map((layer, index) => [layer.id, (ordered.length - index) * 10]))
  const features: MapFeature[] = []
  for (const entity of snapshot.entities) {
    if (entity.deleted || entity.entityType !== "feature") continue
    const feature = entity.payload as Feature
    const layer = layers.get(feature.layerId)
    if (!layer) continue
    const name = feature.properties.name
    features.push({
      id: feature.id,
      name: typeof name === "string" ? name : feature.id,
      layerId: feature.layerId,
      geometry: feature.geometry,
      color: layer.style.color,
      fillOpacity: layer.style.fillOpacity,
      strokeWidth: layer.style.strokeWidth,
      stack: stackOf.get(layer.id) ?? 0,
      label: labelText(feature.properties, layer.style.labelAttribute),
      properties: plainProperties(feature.properties),
    })
  }
  return {
    layers: ordered.map((layer) => ({
        id: layer.id,
        name: layer.name,
        geometryType: layer.geometryType,
        color: layer.style.color,
        fillOpacity: layer.style.fillOpacity,
        labelAttribute: layer.style.labelAttribute,
        groupId: layer.groupId,
        count: features.filter((feature) => feature.layerId === layer.id).length,
        delivery: layer.delivery ?? null,
      })),
    groups,
    features,
  }
}

export function projectName(snapshot: SnapshotResponse): string {
  const settings = snapshot.entities.find((entity) => entity.entityType === "projectSettings" && !entity.deleted)
  if (!settings) return ""
  const name = (settings.payload as { name?: unknown }).name
  return typeof name === "string" ? name : ""
}
