import { createRegistry } from "@cartography/extension-api"
import { exampleExtension } from "@cartography/extension-example"

/**
 * Build-time extension list. Add an extension here. Do not fetch one at runtime.
 */
export const extensions = createRegistry()
extensions.register(exampleExtension)
