import { createId } from "@cartography/project-schema"
import type { AppDatabase } from "../db/open.js"
import { hashSecret, newSecret } from "../auth/tokens.js"

export type TokenKind = "editor" | "read" | "device" | "publication"

/** Returns the plaintext once. Only the hash is stored. */
export function issueProjectToken(
  db: AppDatabase,
  projectId: string,
  kind: TokenKind,
  deviceId: string | null = null,
): string {
  const token = newSecret()
  db.prepare(
    `INSERT INTO project_tokens (id, project_id, kind, hash, device_id, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  ).run(createId(), projectId, kind, hashSecret(token), deviceId)
  return token
}
