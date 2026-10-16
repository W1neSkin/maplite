import type { ReactNode } from "react"

/**
 * Public extension contracts.
 * An extension imports this module only. It does not import the map,
 * the server, or files inside another package.
 */

export type ImportFile = {
  name: string
  bytes: Uint8Array
}

export type ImportInput = {
  files: readonly ImportFile[]
}

export type ImportWarning = {
  code: string
  message: string
}

export type ImportPreview = {
  title: string
  featureCount: number
  geometryTypes: readonly ("Point" | "LineString" | "Polygon")[]
  warnings: readonly ImportWarning[]
}

export type ImportDecisions = {
  encoding?: string
  crsProfileId?: string
  operationId?: string
}

/** One feature, still in OGC:CRS84 (longitude, latitude). */
export type FeatureDraft = {
  geometry: {
    type: "Point" | "LineString" | "Polygon"
    coordinates: unknown
  }
  properties: Record<string, unknown>
}

export interface LayerImporter {
  id: string
  inspect(input: ImportInput): Promise<ImportPreview>
  import(input: ImportInput, decisions: ImportDecisions): AsyncIterable<FeatureDraft>
}

export type SymbolDefinition = {
  id: string
  label: string
  svg: string
}

export interface SymbolPack {
  id: string
  symbols: readonly SymbolDefinition[]
}

export type PositionSourceContext = {
  projectId: string
  objectId: string
}

export type PositionSubscription = {
  close(): void
}

export interface PositionSource {
  id: string
  connect(ctx: PositionSourceContext): PositionSubscription
}

export type TileSourceDefinition = {
  url: string
  maxZoom?: number
  attributions: string
}

export interface BasemapProvider {
  id: string
  sourceCrs: string
  attribution: string
  createSource(): TileSourceDefinition
}

export type ToolCommand = {
  id: string
  label: string
}

/** The only map state a tool panel is allowed to see. */
export type PublicToolContext = {
  projectId: string | null
  layerId: string | null
}

export interface ToolPanel {
  id: string
  command: ToolCommand
  render(ctx: PublicToolContext): ReactNode
}
