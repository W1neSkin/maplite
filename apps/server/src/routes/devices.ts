import { Hono } from "hono"
import { accessFor, canWriteProject } from "../auth/guard.js"
import type { AppEnv } from "../app-env.js"
import type { ServerConfig } from "../config.js"
import type { AppDatabase } from "../db/open.js"
import { apiError, invalidToken } from "../http.js"
import { createEnrollment, listDevices, redeemEnrollment, removeDevice } from "../services/enrollment.js"

export function deviceRoutes(db: AppDatabase, config: ServerConfig): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  routes.get("/api/v1/projects/:projectId/devices", (c) => {
    const projectId = c.req.param("projectId")
    const access = accessFor(db, config, c.req.header("authorization"))
    if (!canWriteProject(access, projectId)) return invalidToken(c)
    return c.json({ devices: listDevices(db, projectId) })
  })

  routes.post("/api/v1/projects/:projectId/enrollments", (c) => {
    const projectId = c.req.param("projectId")
    const access = accessFor(db, config, c.req.header("authorization"))
    if (!canWriteProject(access, projectId)) return invalidToken(c)
    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)
    if (!project) return access?.role === "admin" ? apiError(c, 404, "not_found", "Project not found") : invalidToken(c)
    return c.json(createEnrollment(db, projectId, config.publicBaseUrl), 201)
  })

  routes.delete("/api/v1/projects/:projectId/devices/:deviceId", (c) => {
    const projectId = c.req.param("projectId")
    const access = accessFor(db, config, c.req.header("authorization"))
    if (!canWriteProject(access, projectId)) return invalidToken(c)
    const removed = removeDevice(db, projectId, c.req.param("deviceId"))
    if (!removed) return apiError(c, 404, "not_found", "Device was not found")
    return c.json({ removed: true })
  })

  routes.post("/api/v1/enrollments/redeem", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      code?: unknown
      deviceId?: unknown
      platform?: unknown
      displayName?: unknown
      appVersion?: unknown
    } | null
    if (!body || typeof body.code !== "string" || typeof body.deviceId !== "string" || typeof body.displayName !== "string") {
      return apiError(c, 400, "validation", "Enrollment code is required")
    }
    const platform = typeof body.platform === "string" ? body.platform : "unknown"
    const appVersion = typeof body.appVersion === "string" ? body.appVersion : ""
    if (body.displayName.trim().length === 0 || body.displayName.length > 80) {
      return apiError(c, 400, "validation", "Device name is required")
    }
    const redeemed = redeemEnrollment(db, {
      code: body.code,
      deviceId: body.deviceId,
      platform,
      displayName: body.displayName.trim(),
      appVersion,
    })
    if (!redeemed) return apiError(c, 401, "invalid_code", "Enrollment code is invalid")
    return c.json(redeemed)
  })

  return routes
}
