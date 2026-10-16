import { moveItem } from "./order.js"

/** A missing walk number sorts after numbered points and keeps the stored order. */
export function byWalk(left: { properties: { walk?: unknown } }, right: { properties: { walk?: unknown } }): number {
  const a = typeof left.properties.walk === "number" ? left.properties.walk : null
  const b = typeof right.properties.walk === "number" ? right.properties.walk : null
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a - b
}

/** Ids after one step. Null when the point is already at that end. */
export function movedIds(ids: readonly string[], id: string, direction: -1 | 1): string[] | null {
  const from = ids.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= ids.length) return null
  return moveItem(ids, from, to)
}
