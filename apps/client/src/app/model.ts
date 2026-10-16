import type { Feature, Layer, SnapshotResponse } from "@cartography/project-schema"

export type MapLayer = {
  id: string
  name: string
  geometryType: Layer["geometryType"]
  count: number
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
}

export type MapModel = {
  layers: MapLayer[]
  features: MapFeature[]
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
    })
  }
  return {
    layers: ordered.map((layer) => ({
        id: layer.id,
        name: layer.name,
        geometryType: layer.geometryType,
        count: features.filter((feature) => feature.layerId === layer.id).length,
      })),
    features,
  }
}

export function projectName(snapshot: SnapshotResponse): string {
  const settings = snapshot.entities.find((entity) => entity.entityType === "projectSettings" && !entity.deleted)
  if (!settings) return ""
  const name = (settings.payload as { name?: unknown }).name
  return typeof name === "string" ? name : ""
}
