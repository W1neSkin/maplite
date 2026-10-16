import { SCHEMA_VERSION, type PushRequest, type SyncOperation } from "@cartography/project-schema"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { accessFor, canReadProject, canWriteProject } from "../auth/guard.js"
import type { AppEnv } from "../app-env.js"
import type { ServerConfig } from "../config.js"
import type { AppDatabase } from "../db/open.js"
import { subscribe } from "../events.js"
import { apiError, invalidToken } from "../http.js"
import { pushOperations, readChanges } from "../services/sync.js"

const KINDS = new Set(["create", "update", "delete"])

function parsePush(body: unknown, projectId: string): PushRequest | null {
  if (!body || typeof body !== "object") return null
  const operations = (body as { operations?: unknown }).operations
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > 200) return null
  const parsed: SyncOperation[] = []
  for (const item of operations) {
    if (!item || typeof item !== "object") return null
    const op = item as SyncOperation
    if (typeof op.opId !== "string" || typeof op.clientId !== "string" || typeof op.entityId !== "string") return null
    if (op.projectId !== projectId || !KINDS.has(op.kind)) return null
    if (op.kind !== "create" && typeof op.baseVersion !== "number") return null
    parsed.push(op)
  }
  const schemaVersion = (body as { schemaVersion?: unknown }).schemaVersion
  const atomic = (body as { atomic?: unknown }).atomic === true
  return {
    operations: parsed,
    atomic,
    ...(typeof schemaVersion === "number" ? { schemaVersion } : {}),
  }
}

export function syncRoutes(db: AppDatabase, config: ServerConfig): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  routes.post("/api/v1/projects/:projectId/sync/push", async (c) => {
    const projectId = c.req.param("projectId")
    const access = accessFor(db, config, c.req.header("authorization"))
    if (!canWriteProject(access, projectId)) return invalidToken(c)
    const request = parsePush(await c.req.json().catch(() => null), projectId)
    if (!request) return apiError(c, 400, "validation", "Sync operations are invalid")
    const pushed = pushOperations(db, projectId, request)
    if (pushed === "schema") return apiError(c, 409, "upgrade_required", "This server needs a newer client")
    if (!pushed) return access?.role === "admin" ? apiError(c, 404, "not_found", "Project not found") : invalidToken(c)
    return c.json(pushed)
  })

  routes.get("/api/v1/projects/:projectId/sync/changes", (c) => {
    const projectId = c.req.param("projectId")
    const access = accessFor(db, config, c.req.header("authorization"))
    if (!canReadProject(access, projectId)) return invalidToken(c)
    const after = Number(c.req.query("after") ?? 0)
    const limitRaw = Number(c.req.query("limit") ?? 200)
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 200
    const changes = readChanges(db, projectId, Number.isFinite(after) ? after : 0, limit)
    if (!changes) return access?.role === "admin" ? apiError(c, 404, "not_found", "Project not found") : invalidToken(c)
    if (changes.schemaVersion !== SCHEMA_VERSION) return apiError(c, 409, "upgrade_required", "This server needs a newer client")
    return c.json(changes)
  })

  routes.get("/api/v1/projects/:projectId/events", (c) => {
    const projectId = c.req.param("projectId")
    const access = accessFor(db, config, c.req.header("authorization"))
    if (!canReadProject(access, projectId)) return invalidToken(c)
    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)
    if (!project) return access?.role === "admin" ? apiError(c, 404, "not_found", "Project not found") : invalidToken(c)
    const watermark = (db.prepare("SELECT COALESCE(MAX(seq), 0) AS watermark FROM project_changes WHERE project_id = ?").get(projectId) as {
      watermark: number
    }).watermark
    return streamSSE(c, async (stream) => {
      let closed = false
      const unsubscribe = subscribe(projectId, (event, data) => {
        if (!closed) void stream.writeSSE({ event, data: JSON.stringify(data) })
      })
      stream.onAbort(() => {
        closed = true
        unsubscribe()
      })
      await stream.writeSSE({ event: "changes-available", data: JSON.stringify({ watermark }) })
      while (!closed) {
        await stream.sleep(15_000)
        if (closed) break
        await stream.write(":\n\n")
      }
    })
  })

  return routes
}
