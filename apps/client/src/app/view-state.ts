function key(projectId: string): string {
  return `cartography.hiddenLayers.${projectId}`
}

/** Hidden layers stay on this device. Other people still see them. */
export function readHidden(projectId: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(projectId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item) => typeof item === "string"))
  } catch {
    return new Set()
  }
}

export function writeHidden(projectId: string, ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(key(projectId), JSON.stringify([...ids]))
  } catch {
    // Private mode can refuse storage. The eye still works until reload.
  }
}
