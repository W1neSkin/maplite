import { describe, expect, it } from "vitest"
import { createRegistry } from "@cartography/extension-api"
import { exampleExtension } from "../src/index.js"

const collection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-0.16, 51.51] }, properties: { name: "Gate" } },
    {
      type: "Feature",
      geometry: { type: "GeometryCollection", geometries: [] },
      properties: {},
    },
  ],
}

describe("example extension", () => {
  it("registers a symbol and a JSON importer through the public registry", async () => {
    const registry = createRegistry()
    registry.register(exampleExtension)
    expect(registry.symbolPacks()[0]?.symbols[0]?.label).toBe("Marker")
    const importer = registry.importers()[0]
    expect(importer).toBeDefined()
    const bytes = new TextEncoder().encode(JSON.stringify(collection))
    const preview = await importer!.inspect({ files: [{ name: "places.json", bytes }] })
    expect(preview.featureCount).toBe(1)
    expect(preview.warnings.map((warning) => warning.code)).toContain("json.geometry")
    const imported = []
    for await (const feature of importer!.import({ files: [{ name: "places.json", bytes }] }, {})) {
      imported.push(feature)
    }
    expect(imported).toHaveLength(1)
    expect(imported[0]?.geometry.type).toBe("Point")
  })
})
