import type {
  FeatureDraft,
  ImportInput,
  ImportPreview,
  ImportWarning,
  LayerImporter,
} from "@cartography/extension-api"

const GEOMETRY_TYPES = ["Point", "LineString", "Polygon"] as const
type GeometryType = (typeof GEOMETRY_TYPES)[number]

type ReadResult = {
  title: string
  features: FeatureDraft[]
  warnings: ImportWarning[]
}

function isGeometryType(value: string): value is GeometryType {
  return GEOMETRY_TYPES.some((type) => type === value)
}

function jsonFile(input: ImportInput) {
  return input.files.find((file) => file.name.toLowerCase().endsWith(".json")) ?? null
}

/**
 * Reads a small GeoJSON FeatureCollection.
 * This is the sample importer. Shapefile import is a different package.
 */
function readJson(input: ImportInput): ReadResult {
  const file = jsonFile(input)
  if (!file) {
    return {
      title: "JSON",
      features: [],
      warnings: [{ code: "json.missing", message: "No .json file was provided" }],
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes))
  } catch {
    return {
      title: file.name,
      features: [],
      warnings: [{ code: "json.invalid", message: "The file is not UTF-8 JSON" }],
    }
  }
  const collection = parsed as { features?: unknown }
  const rawFeatures = Array.isArray(collection.features) ? collection.features : []
  const features: FeatureDraft[] = []
  const warnings: ImportWarning[] = []
  if (!Array.isArray(collection.features)) {
    warnings.push({ code: "json.shape", message: "Expected a GeoJSON FeatureCollection" })
  }
  for (const item of rawFeatures) {
    const feature = item as { geometry?: { type?: string; coordinates?: unknown }; properties?: unknown }
    const type = feature.geometry?.type ?? ""
    if (!isGeometryType(type)) {
      warnings.push({ code: "json.geometry", message: `Skipped a ${type || "feature"} geometry` })
      continue
    }
    const properties = feature.properties
    features.push({
      geometry: { type, coordinates: feature.geometry?.coordinates },
      properties: properties && typeof properties === "object" ? (properties as Record<string, unknown>) : {},
    })
  }
  return { title: file.name, features, warnings }
}

export const jsonImporter: LayerImporter = {
  id: "example.json",
  async inspect(input): Promise<ImportPreview> {
    const read = readJson(input)
    const geometryTypes = [...new Set(read.features.map((feature) => feature.geometry.type))]
    return {
      title: read.title,
      featureCount: read.features.length,
      geometryTypes,
      warnings: read.warnings,
    }
  },
  async *import(input) {
    const read = readJson(input)
    for (const feature of read.features) yield feature
  },
}
