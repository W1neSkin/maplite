import { describe, expect, it } from "vitest"
import type { Feature, Layer } from "@cartography/project-schema"
import { showsLayer } from "../src/app/audience.js"
import { deliveryOperations } from "../src/app/delivery.js"

const source: Layer = {
  id: "source",
  projectId: "p",
  groupId: null,
  name: "Yard",
  geometryType: "Point",
  style: { color: "#2563eb", fillOpacity: 0, strokeWidth: 2, labelAttribute: null },
  source: null,
  status: "ready",
  order: 0,
}

function point(id: string): Feature {
  return { id, projectId: "p", layerId: "source", geometry: { type: "Point", coordinates: [27.5, 53.9] }, properties: { name: id } }
}

describe("delivery audience", () => {
  it("hides the copy on the main window and shows it only to the addressed phone", () => {
    const sent = { sourceLayerId: "source", audience: ["phone-1"] as "all" | string[] }
    expect(showsLayer(undefined, "main", null)).toBe(true)
    expect(showsLayer({ ...sent, audience: "all" }, "main", null)).toBe(false)
    expect(showsLayer({ ...sent, audience: "all" }, "device", null)).toBe(true)
    expect(showsLayer(sent, "device", "phone-1")).toBe(true)
    expect(showsLayer(sent, "device", "phone-2")).toBe(false)
    expect(showsLayer(sent, "device", null)).toBe(false)
  })
})

describe("delivery operations", () => {
  it("creates one copy and replaces that same copy on the next send", () => {
    const created = deliveryOperations({ projectId: "p", clientId: "desk", source, features: [point("a"), point("b")], existing: null, audience: "all", order: 3 })
    expect(created).toHaveLength(3)
    expect(created?.[0]?.kind).toBe("create")
    const copy = created?.[0]?.payload as Layer
    expect(copy.delivery).toEqual({ sourceLayerId: "source", audience: "all" })
    expect(copy.name).toBe("Yard")
    const again = deliveryOperations({
      projectId: "p",
      clientId: "desk",
      source: { ...source, name: "Yard west" },
      features: [point("a")],
      existing: { layer: copy, version: 2, features: [{ id: "old", version: 1 }] },
      audience: ["phone-1"],
      order: 9,
    })
    expect(again?.[0]?.kind).toBe("update")
    expect(again?.[0]?.entityId).toBe(copy.id)
    expect(again?.[1]?.kind).toBe("delete")
    expect(again).toHaveLength(3)
    expect((again?.[0]?.payload as Layer).delivery?.audience).toEqual(["phone-1"])
  })
})
