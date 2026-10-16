import { existsSync } from "node:fs"
import { join } from "node:path"
import { serveStatic } from "@hono/node-server/serve-static"
import type { Hono } from "hono"
import type { AppEnv } from "./app-env.js"

// The map page is served by this process, so a browser on any computer can
// open the public address. The API keeps a stricter policy of its own.
const PAGE_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "connect-src 'self' https://tile.openstreetmap.org",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
].join("; ")

export function attachSite(app: Hono<AppEnv>, directory: string): void {
  if (!existsSync(join(directory, "index.html"))) return
  // serveStatic finalizes the response before its onFound hook, so the
  // page policy has to be applied after the file is chosen.
  app.use("*", async (c, next) => {
    await next()
    if (c.res.ok) c.res.headers.set("Content-Security-Policy", PAGE_POLICY)
  })
  app.use("*", serveStatic({ root: directory }))
}
