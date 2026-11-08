import { unzipSync } from "fflate"

const DB = "cartography.tiles"
const STORE = "tiles"
/** A cap so viewing the public demo tiles cannot turn into a bulk download. */
const MAX_TILES = 4000

const listeners = new Set<() => void>()

export function watchTiles(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  for (const listener of listeners) listener()
}

export function tileKey(path: string): string | null {
  const match = /(\d+)\/(\d+)\/(\d+)\.png$/i.exec(path.replaceAll("\\", "/"))
  if (!match) return null
  return `${match[1]}/${match[2]}/${match[3]}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readTile(key: string): Promise<Blob | null> {
  const db = await openDb()
  const blob = await done(db.transaction(STORE).objectStore(STORE).get(key))
  db.close()
  return blob instanceof Blob ? blob : null
}

async function countTiles(db: IDBDatabase): Promise<number> {
  return done(db.transaction(STORE).objectStore(STORE).count())
}

export async function tileCount(): Promise<number> {
  const db = await openDb()
  const count = await countTiles(db)
  db.close()
  return count
}

async function putTile(db: IDBDatabase, key: string, blob: Blob): Promise<void> {
  await done(db.transaction(STORE, "readwrite").objectStore(STORE).put(blob, key))
}

/** Remember one tile the map has already fetched. Stops at the cap. */
export async function rememberTile(key: string, blob: Blob): Promise<void> {
  const db = await openDb()
  const existing = await done(db.transaction(STORE).objectStore(STORE).get(key))
  if (existing instanceof Blob) {
    db.close()
    return
  }
  if ((await countTiles(db)) >= MAX_TILES) {
    db.close()
    return
  }
  await putTile(db, key, blob)
  db.close()
}

export async function storeZip(bytes: Uint8Array): Promise<number> {
  const db = await openDb()
  let count = await countTiles(db)
  const files = unzipSync(bytes)
  for (const [path, data] of Object.entries(files)) {
    const key = tileKey(path)
    if (!key || count >= MAX_TILES) continue
    const existing = await done(db.transaction(STORE).objectStore(STORE).get(key))
    if (existing instanceof Blob) continue
    const copy = new Uint8Array(data.byteLength)
    copy.set(data)
    await putTile(db, key, new Blob([copy], { type: "image/png" }))
    count += 1
  }
  db.close()
  notify()
  return count
}

export async function clearTiles(): Promise<void> {
  const db = await openDb()
  await done(db.transaction(STORE, "readwrite").objectStore(STORE).clear())
  db.close()
  notify()
}

function latTile(latitude: number, zoom: number): number {
  const radians = (Math.max(-85, Math.min(85, latitude)) * Math.PI) / 180
  const n = 2 ** zoom
  return Math.floor(((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * n)
}

/** Tiles covering the screen. A very wide view keeps only the middle, not the whole world. */
export function viewTileKeys(southWest: [number, number], northEast: [number, number], zoom: number): string[] {
  const z = Math.max(0, Math.min(19, Math.round(zoom)))
  const n = 2 ** z
  const x0 = Math.max(0, Math.min(n - 1, Math.floor(((Math.min(southWest[0], northEast[0]) + 180) / 360) * n)))
  const x1 = Math.max(0, Math.min(n - 1, Math.floor(((Math.max(southWest[0], northEast[0]) + 180) / 360) * n)))
  const y0 = Math.max(0, Math.min(n - 1, latTile(Math.max(southWest[1], northEast[1]), z)))
  const y1 = Math.max(0, Math.min(n - 1, latTile(Math.min(southWest[1], northEast[1]), z)))
  const keys: string[] = []
  const width = x1 - x0 + 1
  const height = y1 - y0 + 1
  const span = width * height > 49 ? 3 : null
  const cx = Math.floor((x0 + x1) / 2)
  const cy = Math.floor((y0 + y1) / 2)
  for (let x = span == null ? x0 : cx - span; x <= (span == null ? x1 : cx + span); x++) {
    for (let y = span == null ? y0 : cy - span; y <= (span == null ? y1 : cy + span); y++) {
      if (x >= 0 && y >= 0 && x < n && y < n) keys.push(`${z}/${x}/${y}`)
    }
  }
  return keys
}

/** Saves the tiles on screen so the same view still draws without a network. */
export async function storeViewTiles(keys: readonly string[]): Promise<number> {
  for (const key of keys) {
    if (await readTile(key)) continue
    try {
      const response = await fetch(`https://tile.openstreetmap.org/${key}.png`)
      if (!response.ok) continue
      await rememberTile(key, await response.blob())
    } catch {
      // One missing tile does not cancel the rest of the view.
    }
  }
  notify()
  return tileCount()
}
