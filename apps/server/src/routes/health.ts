import { Hono } from "hono"
import type { AppEnv } from "../app-env.js"
import { databaseReady } from "../db/migrate.js"
import type { AppDatabase } from "../db/open.js"

export function healthRoutes(db: AppDatabase, migrationsDir: string): Hono<AppEnv> {
  const routes = new Hono<AppEnv>()
  routes.get("/health/live", (c) => c.json({ ok: true }))
  routes.get("/health/ready", (c) => {
    try {
      if (!databaseReady(db, migrationsDir)) return c.json({ ok: false }, 503)
      return c.json({ ok: true })
    } catch {
      return c.json({ ok: false }, 503)
    }
  })
  return routes
}
