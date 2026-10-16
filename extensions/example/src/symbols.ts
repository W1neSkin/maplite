import type { SymbolPack } from "@cartography/extension-api"

/**
 * A neutral marker. The example owns the drawing; the map only asks the
 * registry for symbol packs and does not know this file exists.
 */
export const exampleSymbols: SymbolPack = {
  id: "example.symbols",
  symbols: [
    {
      id: "example.marker",
      label: "Marker",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" fill="#1f4d3a"/>
        <circle cx="16" cy="16" r="4" fill="#f4f1ea"/>
      </svg>`,
    },
  ],
}
