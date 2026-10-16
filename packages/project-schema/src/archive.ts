import type { EntityType } from "./entities.js"

/** Portable project. It is not a Shapefile. */
export type ProjectArchive = {
  format: "cartography-archive"
  version: 1
  project: {
    name: string
    schemaVersion: number
  }
  entities: {
    entityType: EntityType
    entityId: string
    version: number
    deleted: boolean
    payload: unknown
  }[]
}
