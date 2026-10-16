import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import { Hono } from "hono"
import { secureHeaders } from "hono/secure-headers"
import type { AppEnv } from "./app-env.js"
import type { ServerConfig } from "./config.js"
import type { AppDatabase } from "./db/open.js"
import { apiError } from "./http.js"
import { logEvent } from "./log.js"
import { rateLimit } from "./rate-limit.js"
import { healthRoutes } from "./routes/health.js"
import { projectRoutes } from "./routes/projects.js"
import { snapshotRoutes } from "./routes/snapshot.js"
import { syncRoutes } from "./routes/sync.js"
import { deviceRoutes } from "./routes/devices.js"
import { systemRoutes } from "./routes/system.js"
import { placeRoutes } from "./routes/place.js"

export function createApp(db: AppDatabase, config: ServerConfig, options: { migrationsDir: string }) {
  const app = new Hono<AppEnv>()

  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID()
    c.set("requestId", requestId)
    c.header("X-Request-Id", requestId)
    const started = Date.now()
    try {
      await next()
    } finally {
      if (!c.req.path.startsWith("/health")) {
        logEvent({
          requestId,
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          ms: Date.now() - started,
        })
      }
    }
  })

  // The browser is a different origin. same-origin CORP would block it even
  // when the CORS allow list says yes.
  app.use(
    "*",
    secureHeaders({
      crossOriginResourcePolicy: "cross-origin",
      contentSecurityPolicy: { defaultSrc: ["'none'"] },
    }),
  )
  app.use("/api/*", rateLimit(240, 60_000))
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (config.corsOrigins.includes(origin) ? origin : null),
      allowHeaders: ["Authorization", "Content-Type"],
      exposeHeaders: ["X-Request-Id"],
    }),
  )
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: Math.min(config.maxImportBytes, 8_000_000),
      onError: (c) => apiError(c, 413, "payload_too_large", "Request body is too large"),
    }),
  )

  app.route("/", healthRoutes(db, options.migrationsDir))
  app.route("/", systemRoutes(config))
  app.route("/", projectRoutes(db, config))
  app.route("/", snapshotRoutes(db, config))
  app.route("/", syncRoutes(db, config))
  app.route("/", deviceRoutes(db, config))
  app.route("/", placeRoutes(db, config))

  app.notFound((c) => apiError(c, 404, "not_found", "Not found"))
  app.onError((error, c) => {
    logEvent({
      event: "error",
      requestId: c.get("requestId") ?? "",
      name: error.name,
      message: error.message,
    })
    return c.json({ code: "internal", message: "Internal server error", requestId: c.get("requestId") }, 500)
  })

  return app
}
