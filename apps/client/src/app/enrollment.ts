/** The picture stores the server address and the one-time code. A plain code still works. */
export function readEnrollment(raw: string): { code: string; serverUrl: string | null } {
  const text = raw.trim()
  try {
    const parsed = JSON.parse(text) as { code?: unknown; serverUrl?: unknown }
    if (typeof parsed.code === "string" && parsed.code.trim()) {
      return {
        code: parsed.code.trim(),
        serverUrl: typeof parsed.serverUrl === "string" && parsed.serverUrl.trim() ? parsed.serverUrl.trim() : null,
      }
    }
  } catch {
    // The picture can also be the code alone.
  }
  return { code: text, serverUrl: null }
}
