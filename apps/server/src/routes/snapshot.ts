import { Hono } from "hono"
import { accessFor } from "../auth/guard.js"
import type { AppEnv } from "../app-env.js"
import type { ServerConfig } from "../config.js"
import type { AppDatabase } from "../db/open.js"
import { apiError, invalidToken } from "../http.js"
import { readSnapshot } from "../services/snapshot.js"

const READ_KINDS = new Set(["editor", "read", "device"])

export function snapshotRoutes(db: AppDatabase, config: ServerConfig): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  routes.get("/api/v1/projects/:projectId/sync/snapshot", (c) => {
    const projectId = c.req.param("projectId")
    const access = accessFor(db, config, c.req.header("authorization"))
    const allowed =
      access?.role === "admin" ||
      (access?.role === "project" && access.projectId === projectId && READ_KINDS.has(access.kind))
    if (!allowed) return invalidToken(c)

    const limitRaw = Number(c.req.query("limit") ?? 200)
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 200
    const snapshot = readSnapshot(db, projectId, c.req.query("cursor") ?? null, limit)
    if (!snapshot) {
      if (access?.role === "admin") return apiError(c, 404, "not_found", "Project not found")
      return invalidToken(c)
    }
    return c.json(snapshot)
  })

  return routes
}
