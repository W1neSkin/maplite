import type { ServerConfig } from "../config.js"
import type { AppDatabase } from "../db/open.js"
import { hashSecret, secretsMatch } from "./tokens.js"

export type Access =
  | { role: "admin" }
  | { role: "project"; projectId: string; kind: string }

export function readBearer(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/.exec(header)
  return match?.[1] ?? null
}

/**
 * A missing token, a wrong token, and a token for another project all come
 * back as "no access". Callers use one error so the id is not confirmed.
 */
export function accessFor(db: AppDatabase, config: ServerConfig, authorization: string | undefined): Access | null {
  const token = readBearer(authorization)
  if (!token) return null
  if (config.adminToken && secretsMatch(token, config.adminToken)) return { role: "admin" }
  const row = db
    .prepare(
      `SELECT project_id, kind FROM project_tokens
       WHERE hash = ? AND revoked_at IS NULL`,
    )
    .get(hashSecret(token)) as { project_id: string; kind: string } | undefined
  if (!row) return null
  return { role: "project", projectId: row.project_id, kind: row.kind }
}

const READ_KINDS = new Set(["editor", "read", "device"])
const WRITE_KINDS = new Set(["editor", "device"])

export function canReadProject(access: Access | null, projectId: string): boolean {
  if (!access) return false
  if (access.role === "admin") return true
  return access.projectId === projectId && READ_KINDS.has(access.kind)
}

export function canWriteProject(access: Access | null, projectId: string): boolean {
  if (!access) return false
  if (access.role === "admin") return true
  return access.projectId === projectId && WRITE_KINDS.has(access.kind)
}
