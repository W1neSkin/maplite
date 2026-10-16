const KEY = "cartography.track"

export function readLocalTrack(): [number, number][] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is [number, number] => Array.isArray(item) && item.length >= 2 && typeof item[0] === "number" && typeof item[1] === "number")
  } catch {
    return []
  }
}

/** Skip a point that has barely moved. The stored line is not the live marker. */
export function appendLocalTrack(coordinate: [number, number], moved: (from: [number, number], to: [number, number]) => boolean): void {
  const points = readLocalTrack()
  const last = points[points.length - 1]
  if (last && !moved(last, coordinate)) return
  points.push(coordinate)
  try {
    localStorage.setItem(KEY, JSON.stringify(points.slice(-5000)))
  } catch {
    // The points already on the map stay until this process ends.
  }
}

export function clearLocalTrack(): void {
  localStorage.removeItem(KEY)
}
