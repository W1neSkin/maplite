import { Hono } from "hono"
import { accessFor, canReadProject } from "../auth/guard.js"
import type { AppEnv } from "../app-env.js"
import type { ServerConfig } from "../config.js"
import type { AppDatabase } from "../db/open.js"
import { apiError, invalidToken } from "../http.js"
import { deleteProject, duplicateProject, exportArchive, importArchive } from "../services/archive.js"
import { createProject, listProjects } from "../services/projects.js"
import type { ProjectArchive } from "@cartography/project-schema"

function requireAdmin(db: AppDatabase, config: ServerConfig, authorization: string | undefined, c: Parameters<typeof invalidToken>[0]) {
  const access = accessFor(db, config, authorization)
  if (access?.role !== "admin") return invalidToken(c)
  return null
}

export function projectRoutes(db: AppDatabase, config: ServerConfig): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()

  routes.get("/api/v1/projects", (c) => {
    const denied = requireAdmin(db, config, c.req.header("authorization"), c)
    if (denied) return denied
    return c.json({ projects: listProjects(db) })
  })

  routes.post("/api/v1/projects", async (c) => {
    const denied = requireAdmin(db, config, c.req.header("authorization"), c)
    if (denied) return denied
    const body = await c.req.json().catch(() => null)
    const name = body && typeof body === "object" && "name" in body ? (body as { name: unknown }).name : null
    if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 80) {
      return apiError(c, 400, "validation", "Project name is required")
    }
    return c.json(createProject(db, name.trim()), 201)
  })

  routes.get("/api/v1/session", (c) => {
    const access = accessFor(db, config, c.req.header("authorization"))
    if (!access) return invalidToken(c)
    if (access.role === "admin") return c.json({ role: "admin" })
    return c.json({ role: "project", projectId: access.projectId, kind: access.kind, deviceId: access.deviceId })
  })

  routes.post("/api/v1/projects/:projectId/duplicate", (c) => {
    const denied = requireAdmin(db, config, c.req.header("authorization"), c)
    if (denied) return denied
    const copied = duplicateProject(db, c.req.param("projectId"))
    if (!copied) return apiError(c, 404, "not_found", "Project not found")
    return c.json(copied, 201)
  })

  routes.delete("/api/v1/projects/:projectId", (c) => {
    const denied = requireAdmin(db, config, c.req.header("authorization"), c)
    if (denied) return denied
    const removed = deleteProject(db, c.req.param("projectId"))
    if (!removed) return apiError(c, 404, "not_found", "Project not found")
    return c.json({ removed: true })
  })

  routes.post("/api/v1/projects/:projectId/archive/export", (c) => {
    const projectId = c.req.param("projectId")
    const access = accessFor(db, config, c.req.header("authorization"))
    if (!canReadProject(access, projectId)) return invalidToken(c)
    const archive = exportArchive(db, projectId)
    if (!archive) return access?.role === "admin" ? apiError(c, 404, "not_found", "Project not found") : invalidToken(c)
    return c.json(archive)
  })

  routes.post("/api/v1/projects/archive/import", async (c) => {
    const denied = requireAdmin(db, config, c.req.header("authorization"), c)
    if (denied) return denied
    const body = (await c.req.json().catch(() => null)) as ProjectArchive | null
    if (!body) return apiError(c, 400, "validation", "Archive is invalid")
    const imported = importArchive(db, body)
    if (imported === "invalid") return apiError(c, 400, "validation", "Archive is invalid")
    return c.json(imported, 201)
  })

  return routes
}
