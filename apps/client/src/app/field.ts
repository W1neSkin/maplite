import type { AverageFix } from "@cartography/geo-core"
import { isPrecise, positionProblem, type PositionProblem } from "../map/position.js"

export type FixCollection = { fixes: AverageFix[]; problem: PositionProblem | null }

/** Collect fresh GPS fixes for a few seconds. A refusal returns at once. Coarse fixes are marked so the average can drop them. */
export function collectFixes(ms = 8000): Promise<FixCollection> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ fixes: [], problem: "waiting" })
      return
    }
    const fixes: AverageFix[] = []
    let problem: PositionProblem | null = null
    let settled = false
    const finish = (next: PositionProblem | null) => {
      if (settled) return
      settled = true
      navigator.geolocation.clearWatch(id)
      resolve({ fixes, problem: next })
    }
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy
        const accuracyM = Number.isFinite(accuracy) ? accuracy : null
        fixes.push({
          id: `${position.timestamp}`,
          coordinate: [position.coords.longitude, position.coords.latitude],
          sampledAtMs: position.timestamp,
          precise: isPrecise(accuracyM),
          horizontalAccuracyM: accuracyM,
        })
      },
      (error) => {
        problem = positionProblem(error.code)
        if (problem === "denied") finish("denied")
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    )
    window.setTimeout(() => finish(fixes.length > 0 ? null : problem ?? "waiting"), ms)
  })
}
