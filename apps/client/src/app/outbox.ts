import { isPhoneApp } from "./connection.js"
import { readPhoneCache, removePhoneCache, writePhoneCache, type PhoneCache } from "./phone-queue.js"
import { ShareLocation } from "../platform/share-location.js"

/**
 * The phone writes the queue to SQLite so it survives a force-stop outside the WebView.
 * The browser uses its own storage only when a request fails.
 */
export async function readDurable(projectId: string): Promise<PhoneCache> {
  const legacy = readPhoneCache(localStorage, projectId)
  if (!isPhoneApp()) return legacy
  try {
    const native = await ShareLocation.readOutbox({ projectId })
    const parsed = normalize(native)
    if (parsed.ops.length > 0 || parsed.docs.length > 0) return parsed
    if (legacy.ops.length > 0 || legacy.docs.length > 0) {
      await ShareLocation.writeOutbox({ projectId, body: JSON.stringify(legacy) })
      removePhoneCache(localStorage, projectId)
      return legacy
    }
  } catch {
    return legacy
  }
  return legacy
}

export async function writeDurable(projectId: string, cache: PhoneCache): Promise<void> {
  if (isPhoneApp()) {
    try {
      await ShareLocation.writeOutbox({ projectId, body: JSON.stringify(cache) })
      removePhoneCache(localStorage, projectId)
      return
    } catch {
      // The WebView copy is the fallback when the native file cannot be opened.
    }
  }
  writePhoneCache(localStorage, projectId, cache)
}

function normalize(value: { ops?: unknown; docs?: unknown } | null): PhoneCache {
  if (!value) return { ops: [], docs: [] }
  return {
    ops: Array.isArray(value.ops) ? value.ops : [],
    docs: Array.isArray(value.docs) ? value.docs : [],
  }
}
