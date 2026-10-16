import { createId, type Feature, type Layer, type SyncOperation } from "@cartography/project-schema"

/** One layer op plus a delete and a create per feature. Past this, one push cannot carry the copy. */
export const DELIVERY_OP_LIMIT = 180

export function deliveryOperations(input: {
  projectId: string
  clientId: string
  source: Layer
  features: readonly Feature[]
  existing: { layer: Layer; version: number; features: readonly { id: string; version: number }[] } | null
  audience: "all" | string[]
  order: number
}): SyncOperation[] | null {
  const copyId = input.existing?.layer.id ?? createId()
  const deletes = input.existing?.features.length ?? 0
  if (1 + deletes + input.features.length > DELIVERY_OP_LIMIT) return null
  const projectId = input.projectId
  const payload: Layer = {
    id: copyId,
    projectId,
    groupId: input.source.groupId,
    name: input.source.name,
    geometryType: input.source.geometryType,
    style: input.source.style,
    source: input.source.source,
    status: "ready",
    order: input.existing?.layer.order ?? input.order,
    delivery: { sourceLayerId: input.source.id, audience: input.audience },
  }
  const operations: SyncOperation[] = [
    input.existing
      ? { opId: createId(), clientId: input.clientId, projectId, entityType: "layer", entityId: copyId, kind: "update", baseVersion: input.existing.version, payload }
      : { opId: createId(), clientId: input.clientId, projectId, entityType: "layer", entityId: copyId, kind: "create", baseVersion: null, payload },
  ]
  for (const feature of input.existing?.features ?? []) {
    operations.push({ opId: createId(), clientId: input.clientId, projectId, entityType: "feature", entityId: feature.id, kind: "delete", baseVersion: feature.version })
  }
  for (const feature of input.features) {
    const id = createId()
    const copy: Feature = { id, projectId, layerId: copyId, geometry: feature.geometry, properties: feature.properties, ...(feature.sourceGeometry ? { sourceGeometry: feature.sourceGeometry } : {}) }
    operations.push({ opId: createId(), clientId: input.clientId, projectId, entityType: "feature", entityId: id, kind: "create", baseVersion: null, payload: copy })
  }
  return operations
}
