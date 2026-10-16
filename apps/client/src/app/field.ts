import type { AverageFix } from "@cartography/geo-core"

/** Collect fresh GPS fixes for a few seconds. Coarse fixes are marked so the average can drop them. */
export function collectFixes(ms = 8000): Promise<AverageFix[]> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve([])
      return
    }
    const fixes: AverageFix[] = []
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy
        fixes.push({
          id: `${position.timestamp}`,
          coordinate: [position.coords.longitude, position.coords.latitude],
          sampledAtMs: position.timestamp,
          precise: accuracy == null || accuracy <= 100,
          horizontalAccuracyM: accuracy ?? null,
        })
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 0 },
    )
    window.setTimeout(() => {
      navigator.geolocation.clearWatch(id)
      resolve(fixes)
    }, ms)
  })
}
