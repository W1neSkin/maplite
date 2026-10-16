import type { ExtensionModule } from "@cartography/extension-api"
import { jsonImporter } from "./importer.js"
import { exampleSymbols } from "./symbols.js"

/** Sample extension. It is wired only through the public registry. */
export const exampleExtension: ExtensionModule = {
  id: "example",
  importers: [jsonImporter],
  symbolPacks: [exampleSymbols],
}
