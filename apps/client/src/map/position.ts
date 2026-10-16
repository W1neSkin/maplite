/** Permission denied is code 1. Anything else means the receiver has not produced a fix. */
export type PositionProblem = "denied" | "waiting"

export function positionProblem(code: number | undefined): PositionProblem {
  return code === 1 ? "denied" : "waiting"
}

/** A missing radius is not called coarse. Over 100 m is. */
export function isPrecise(accuracyM: number | null): boolean {
  return accuracyM == null || accuracyM <= 100
}
