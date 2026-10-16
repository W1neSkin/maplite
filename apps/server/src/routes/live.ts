import { Hono } from "hono"
import { accessFor, canReadProject, canWriteProject } from "../auth/guard.js"
import type { AppEnv } from "../app-env.js"
import type { ServerConfig } from "../config.js"
import type { AppDatabase } from "../db/open.js"
import { apiError, invalidToken } from "../http.js"
import { listLive, publishLive, type LiveEnvelope } from "../services/live.js"

function envelope(body: unknown): LiveEnvelope | null {
  if (!body || typeof body !== "object") return null
  const item = body as { type?: unknown; id?: unknown; fixId?: unknown; sampledAt?: unknown; deviceId?: unknown; body?: unknown }
  if (typeof item.type !== "string" || typeof item.id !== "string" || typeof item.fixId !== "string" || typeof item.sampledAt !== "string") return null
  if (!item.body || typeof item.body !== "object" || Array.isArray(item.body)) return null
  const deviceId = typeof item.deviceId === "string" ? item.deviceId : null
  return { type: item.type, id: item.id, fixId: item.fixId, sampledAt: item.sampledAt, deviceId, body: item.body as Record<string, unknown> }
}

export function liveRoutes(db: AppDatabase, config: ServerConfig): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  routes.get("/api/v1/projects/:projectId/live", (c) => {
    const projectId = c.req.param("projectId")
    const access = accessFor(db, config, c.req.header("authorization"))
    if (!canReadProject(access, projectId)) return invalidToken(c)
    return c.json({ messages: listLive(db, projectId) })
  })

  routes.post("/api/v1/projects/:projectId/live", async (c) => {
    const projectId = c.req.param("projectId")
    const access = accessFor(db, config, c.req.header("authorization"))
    if (!canWriteProject(access, projectId)) return invalidToken(c)
    const input = envelope(await c.req.json().catch(() => null))
    if (!input) return apiError(c, 400, "validation", "Live message is invalid")
    const bound = access?.role === "project" && access.kind === "device" ? access.deviceId : null
    const result = publishLive(db, projectId, input, bound)
    if (result === "forbidden") return invalidToken(c)
    if (result === "invalid") return apiError(c, 400, "validation", "Live message is invalid")
    return c.json({ accepted: result === "ok", ...(result === "stale" ? { reason: "stale" } : {}) })
  })

  return routes
}
