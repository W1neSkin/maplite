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

const PHONE_SERVER = "https://maplite.map.example"

/** The phone must open the permanent address, not a temporary tunnel name. */
export function qrForPage(qrText: string): string {
  try {
    const parsed = JSON.parse(qrText) as { code?: unknown }
    if (typeof parsed.code !== "string") return qrText
    return JSON.stringify({ code: parsed.code, serverUrl: PHONE_SERVER })
  } catch {
    return qrText
  }
}
