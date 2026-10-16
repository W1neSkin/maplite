import type { EditOrigin, Layer } from "@cartography/project-schema"

/** The main window keeps the source layer. A phone sees a copy only when it was addressed. */
export function showsLayer(delivery: Layer["delivery"] | null | undefined, surface: EditOrigin["surface"], deviceId: string | null): boolean {
  if (!delivery) return true
  if (surface === "main") return false
  if (delivery.audience === "all") return true
  return deviceId != null && delivery.audience.includes(deviceId)
}
