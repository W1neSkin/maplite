type Listener = (event: string, data: { watermark: number }) => void

const rooms = new Map<string, Set<Listener>>()

/** In-process fan-out. One server process writes the database, so one map is enough. */
export function subscribe(projectId: string, listener: Listener): () => void {
  const room = rooms.get(projectId) ?? new Set()
  room.add(listener)
  rooms.set(projectId, room)
  return () => {
    room.delete(listener)
    if (room.size === 0) rooms.delete(projectId)
  }
}

export function notifyProject(projectId: string, event: "changes-available" | "positions-available", watermark: number): void {
  const room = rooms.get(projectId)
  if (!room) return
  for (const listener of room) listener(event, { watermark })
}
