/** Rebuild layer order after a drag that stays inside one group. */
export function groupedIds(
  layers: readonly { id: string; groupId: string | null }[],
  groups: readonly { id: string }[],
  groupId: string | null,
  from: number,
  to: number,
): string[] {
  const buckets = new Map<string | null, string[]>()
  for (const group of groups) buckets.set(group.id, [])
  buckets.set(null, [])
  for (const layer of layers) {
    const key = layer.groupId && buckets.has(layer.groupId) ? layer.groupId : null
    buckets.get(key)!.push(layer.id)
  }
  buckets.set(groupId, moveItem(buckets.get(groupId) ?? [], from, to))
  const ids: string[] = []
  for (const group of groups) ids.push(...(buckets.get(group.id) ?? []))
  ids.push(...(buckets.get(null) ?? []))
  return ids
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items]
  const next = items.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}
