import { join } from "node:path"
import { newSecret } from "./auth/tokens.js"
import type { ServerConfig } from "./config.js"
import { migrate } from "./db/migrate.js"
import type { AppDatabase } from "./db/open.js"
import { logEvent } from "./log.js"
import { readCredentials, writeCredentials } from "./services/credentials.js"
import { DEMO_PROJECT_ID, seedDemo } from "./services/demo.js"
import { issueProjectToken } from "./services/tokens.js"

/**
 * Applies migrations and, in local development, remembers the admin and
 * editor tokens in a file. The plaintext is never written to the log.
 */
export function prepareDatabase(db: AppDatabase, config: ServerConfig, root: string): ServerConfig {
  migrate(db, join(root, "migrations"))
  const existing = config.allowDevCredentialsFile ? readCredentials(config.devCredentialsPath) : null
  const mintedAdmin = !config.adminToken && !existing?.adminToken && config.allowDevCredentialsFile
  const adminToken = config.adminToken ?? existing?.adminToken ?? (mintedAdmin ? newSecret() : null)
  if (config.seedDemo) seedDemo(db)

  let editorToken = existing?.editorToken ?? null
  const mintedEditor = config.allowDevCredentialsFile && config.seedDemo && !editorToken
  if (mintedEditor) editorToken = issueProjectToken(db, DEMO_PROJECT_ID, "editor")

  if (config.allowDevCredentialsFile && adminToken) {
    writeCredentials(config.devCredentialsPath, {
      adminToken,
      demoProjectId: config.seedDemo ? DEMO_PROJECT_ID : (existing?.demoProjectId ?? null),
      editorToken,
    })
    if (mintedAdmin || mintedEditor) {
      logEvent({ event: "dev_credentials_written", path: config.devCredentialsPath })
    }
  }
  return { ...config, adminToken }
}
