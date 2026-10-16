import type { BasemapProvider, LayerImporter, PositionSource, SymbolPack, ToolPanel } from "./types.js"

/**
 * Extensions are registered at build time from one list.
 * The app never loads an extension script from the server.
 */
export type ExtensionModule = {
  id: string
  importers?: readonly LayerImporter[]
  symbolPacks?: readonly SymbolPack[]
  positionSources?: readonly PositionSource[]
  basemaps?: readonly BasemapProvider[]
  tools?: readonly ToolPanel[]
}

export type ExtensionRegistry = {
  register(extension: ExtensionModule): void
  list(): readonly ExtensionModule[]
  importers(): readonly LayerImporter[]
  symbolPacks(): readonly SymbolPack[]
  positionSources(): readonly PositionSource[]
  basemaps(): readonly BasemapProvider[]
  tools(): readonly ToolPanel[]
}

export function createRegistry(): ExtensionRegistry {
  const extensions: ExtensionModule[] = []

  function register(extension: ExtensionModule): void {
    if (extensions.some((item) => item.id === extension.id)) {
      throw new Error(`Extension already registered: ${extension.id}`)
    }
    extensions.push(extension)
  }

  return {
    register,
    list: () => extensions,
    importers: () => extensions.flatMap((item) => item.importers ?? []),
    symbolPacks: () => extensions.flatMap((item) => item.symbolPacks ?? []),
    positionSources: () => extensions.flatMap((item) => item.positionSources ?? []),
    basemaps: () => extensions.flatMap((item) => item.basemaps ?? []),
    tools: () => extensions.flatMap((item) => item.tools ?? []),
  }
}
