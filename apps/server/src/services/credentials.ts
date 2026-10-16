import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

/**
 * Local development only. Production never writes this file.
 * The browser reads the editor token from the dev bootstrap route,
 * which in turn reads this file. The token is not compiled into the client.
 */
export type DevCredentials = {
  adminToken: string
  demoProjectId: string | null
  editorToken: string | null
}

export function readCredentials(path: string): DevCredentials | null {
  if (!existsSync(path)) return null
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<DevCredentials>
  if (typeof parsed.adminToken !== "string" || parsed.adminToken.length === 0) return null
  return {
    adminToken: parsed.adminToken,
    demoProjectId: parsed.demoProjectId ?? null,
    editorToken: parsed.editorToken ?? null,
  }
}

export function writeCredentials(path: string, credentials: DevCredentials): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 })
}
