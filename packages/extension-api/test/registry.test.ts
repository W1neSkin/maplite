import { describe, expect, it } from "vitest"
import { createRegistry, type ExtensionModule } from "../src/index.js"

const sample: ExtensionModule = {
  id: "sample",
  symbolPacks: [{ id: "sample.symbols", symbols: [{ id: "dot", label: "Dot", svg: "<svg></svg>" }] }],
}

describe("createRegistry", () => {
  it("collects packs from registered extensions", () => {
    const registry = createRegistry()
    registry.register(sample)
    expect(registry.symbolPacks()).toHaveLength(1)
    expect(registry.importers()).toHaveLength(0)
  })

  it("rejects a second extension with the same id", () => {
    const registry = createRegistry()
    registry.register(sample)
    expect(() => registry.register(sample)).toThrow(/already registered/)
  })
})
