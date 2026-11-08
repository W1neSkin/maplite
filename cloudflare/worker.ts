import { DurableObject } from "cloudflare:workers"
import { createApp } from "../apps/server/src/app.js"
import { loadConfig } from "../apps/server/src/config.js"
import { runPendingMigrations } from "../apps/server/src/db/migrate.js"
import { seedDemo } from "../apps/server/src/services/demo.js"
import { LATEST_WORKER_MIGRATION, WORKER_MIGRATIONS, openWorkerDatabase } from "./sqlite.js"

const PUBLIC_URL = "https://maplite.map.example"
const CORS_ORIGINS = [
  PUBLIC_URL,
  "http://127.0.0.1:3848",
  "http://localhost:3848",
  "https://localhost",
  "capacitor://localhost",
].join(",")

type StorageHost = Parameters<typeof openWorkerDatabase>[0]

type WorkerEnv = {
  MAPLITE: {
    idFromName(name: string): unknown
    get(id: unknown): { fetch(request: Request): Promise<Response> }
  }
  ADMIN_TOKEN?: string
  SEED_DEMO?: string
}

/**
 * The map server runs inside one Durable Object. Its SQLite file and the
 * live-position event table stay in the same place, with no external host.
 */
export class MapliteServer extends DurableObject<WorkerEnv> {
  private readonly app

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env)
    const db = openWorkerDatabase(ctx.storage as unknown as StorageHost)
    runPendingMigrations(db, WORKER_MIGRATIONS)
    const config = loadConfig({
      NODE_ENV: "production",
      ADMIN_TOKEN: env.ADMIN_TOKEN,
      PUBLIC_BASE_URL: PUBLIC_URL,
      CORS_ORIGINS,
      SEED_DEMO: env.SEED_DEMO ?? "false",
      ALLOW_DEV_CREDENTIALS_FILE: "false",
    })
    if (config.seedDemo) seedDemo(db)
    this.app = createApp(db, config, { migrationsDir: LATEST_WORKER_MIGRATION })
  }

  override fetch(request: Request): Promise<Response> {
    return Promise.resolve(this.app.fetch(request))
  }
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const id = env.MAPLITE.idFromName("main")
    return env.MAPLITE.get(id).fetch(request)
  },
}
