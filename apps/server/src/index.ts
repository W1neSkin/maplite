import { serve } from "@hono/node-server"
import { join } from "node:path"
import { createApp } from "./app.js"
import { loadConfig } from "./config.js"
import { openDatabase } from "./db/open.js"
import { logEvent } from "./log.js"
import { serverDir } from "./server-dir.js"
import { attachSite } from "./site.js"
import { prepareDatabase } from "./startup.js"

const root = serverDir()
const loaded = loadConfig()
const db = openDatabase(loaded.databasePath)
const config = prepareDatabase(db, loaded, root)
const app = createApp(db, config, { migrationsDir: join(root, "migrations") })
attachSite(app, join(root, "public"))

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, () => {
  logEvent({ event: "listen", host: config.host, port: config.port })
})
