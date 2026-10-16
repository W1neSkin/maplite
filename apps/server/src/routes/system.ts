import { SCHEMA_VERSION, openApiDocument, type Capabilities } from "@cartography/project-schema"
import { Hono } from "hono"
import type { AppEnv } from "../app-env.js"
import type { ServerConfig } from "../config.js"
import { apiError } from "../http.js"
import { readCredentials } from "../services/credentials.js"

export function systemRoutes(config: ServerConfig): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  routes.get("/api/v1/capabilities", (c) => {
    const body: Capabilities = {
      schemaVersion: SCHEMA_VERSION,
      pushCommands: config.pushCommands,
      tileProxy: config.tileProxy,
      demoLiveStream: config.demoLiveStream,
      positionHistoryLimit: config.positionHistoryLimit,
      trackRetentionDays: config.trackRetentionDays,
    }
    return c.json(body)
  })

  routes.get("/api/v1/openapi.json", (c) => c.json(openApiDocument))

  routes.get("/api/v1/dev/bootstrap", (c) => {
    // Only the machine running the server can pick up the local editor token.
    if (!config.allowDevCredentialsFile) return apiError(c, 404, "not_found", "Not found")
    // app.request() keeps the host on the URL and does not set a Host header.
    // A real browser request has both. Either one must be the local machine.
    const headerHost = c.req.header("host") ?? ""
    let hostname = ""
    try {
      hostname = new URL(c.req.url).hostname
    } catch {
      hostname = ""
    }
    const local =
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      headerHost.startsWith("127.0.0.1") ||
      headerHost.startsWith("localhost")
    if (!local) return apiError(c, 404, "not_found", "Not found")
    const credentials = readCredentials(config.devCredentialsPath)
    if (!credentials?.editorToken || !credentials.demoProjectId) {
      return apiError(c, 503, "dev_credentials_missing", "Development credentials are not ready")
    }
    return c.json({ projectId: credentials.demoProjectId, editorToken: credentials.editorToken })
  })

  return routes
}
