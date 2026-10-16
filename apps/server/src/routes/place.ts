import { Hono } from "hono"
import type { AppEnv } from "../app-env.js"
import { accessFor } from "../auth/guard.js"
import type { ServerConfig } from "../config.js"
import type { AppDatabase } from "../db/open.js"
import { invalidToken } from "../http.js"
import { reversePlace } from "../services/place.js"

export function placeRoutes(db: AppDatabase, config: ServerConfig): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  routes.get("/api/v1/place", async (c) => {
    if (!accessFor(db, config, c.req.header("authorization"))) return invalidToken(c)
    const longitude = Number(c.req.query("longitude"))
    const latitude = Number(c.req.query("latitude"))
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      return c.json({ label: "" })
    }
    const lang = (c.req.query("lang") ?? "en").slice(0, 12)
    const label = await reversePlace(longitude, latitude, lang).catch(() => "")
    return c.json({ label })
  })
  return routes
}
