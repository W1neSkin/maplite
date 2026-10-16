import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { loadConfig, type ServerConfig } from "../src/config.js"
import { databaseReady, migrate } from "../src/db/migrate.js"
import { openDatabase, type AppDatabase } from "../src/db/open.js"
import { prepareDatabase } from "../src/startup.js"
import { DEMO_PROJECT_ID } from "../src/services/demo.js"
import { issueProjectToken } from "../src/services/tokens.js"

const migrationsDir = resolve(fileURLToPath(new URL("..", import.meta.url)), "migrations")
const temp = mkdtempSync(join(tmpdir(), "cartography-"))

afterAll(() => {
  rmSync(temp, { recursive: true, force: true })
})

function config(overrides: NodeJS.ProcessEnv = {}): ServerConfig {
  return loadConfig({
    NODE_ENV: "test",
    SEED_DEMO: "false",
    ALLOW_DEV_CREDENTIALS_FILE: "false",
    DATABASE_PATH: ":memory:",
    ADMIN_TOKEN: "a".repeat(43),
    ...overrides,
  })
}

function appFor(db: AppDatabase, settings = config()) {
  migrate(db, migrationsDir)
  return { app: createApp(db, settings, { migrationsDir }), settings }
}

describe("migrations", () => {
  it("applies a clean database once", () => {
    const db = openDatabase(":memory:")
    expect(migrate(db, migrationsDir)).toEqual(["001_init", "002_device_app_version"])
    expect(migrate(db, migrationsDir)).toEqual([])
    expect(databaseReady(db, migrationsDir)).toBe(true)
  })

  it("reports not ready before migrate", async () => {
    const db = openDatabase(":memory:")
    const app = createApp(db, config(), { migrationsDir })
    const response = await app.request("/health/ready")
    expect(response.status).toBe(503)
  })
})

describe("demo and access", () => {
  it("rejects a production config without a long admin token", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/ADMIN_TOKEN/)
    const production = loadConfig({ NODE_ENV: "production", ADMIN_TOKEN: "b".repeat(43) })
    expect(production.allowDevCredentialsFile).toBe(false)
  })

  it("serves the demo to an editor token and hides it from a wrong token", async () => {
    const credentials = join(temp, "dev-credentials.json")
    const db = openDatabase(":memory:")
    const settings = config({
      SEED_DEMO: "true",
      ALLOW_DEV_CREDENTIALS_FILE: "true",
      DEV_CREDENTIALS_PATH: credentials,
    })
    prepareDatabase(db, settings, resolve(migrationsDir, ".."))
    prepareDatabase(db, settings, resolve(migrationsDir, ".."))
    const tokenCount = db.prepare("SELECT COUNT(*) AS n FROM project_tokens").get() as { n: number }
    expect(tokenCount.n).toBe(1)

    const app = createApp(db, { ...settings, adminToken: settings.adminToken }, { migrationsDir })
    const boot = await app.request("http://127.0.0.1:3847/api/v1/dev/bootstrap")
    expect(boot.status).toBe(200)
    const credentialsBody = (await boot.json()) as { projectId: string; editorToken: string }
    expect(credentialsBody.projectId).toBe(DEMO_PROJECT_ID)

    const remote = await app.request("http://192.168.1.20/api/v1/dev/bootstrap")
    expect(remote.status).toBe(404)

    const snapshot = await app.request(`/api/v1/projects/${DEMO_PROJECT_ID}/sync/snapshot`, {
      headers: { authorization: `Bearer ${credentialsBody.editorToken}` },
    })
    expect(snapshot.status).toBe(200)
    const body = (await snapshot.json()) as { entities: { entityType: string; payload: { name?: string } }[] }
    const layers = body.entities.filter((entity) => entity.entityType === "layer")
    const features = body.entities.filter((entity) => entity.entityType === "feature")
    expect(layers.map((layer) => layer.payload.name)).toEqual(["Points of interest", "Route", "Open ground"])
    expect(features).toHaveLength(5)

    const denied = await app.request(`/api/v1/projects/${DEMO_PROJECT_ID}/sync/snapshot`, {
      headers: { authorization: "Bearer not-a-real-token" },
    })
    expect(denied.status).toBe(401)
    expect(JSON.stringify(await denied.json())).not.toContain("Demo")

    const publication = issueProjectToken(db, DEMO_PROJECT_ID, "publication")
    const blocked = await app.request(`/api/v1/projects/${DEMO_PROJECT_ID}/sync/snapshot`, {
      headers: { authorization: `Bearer ${publication}` },
    })
    expect(blocked.status).toBe(401)
  })

  it("lets an admin create a project and pages a snapshot", async () => {
    const db = openDatabase(":memory:")
    const settings = config()
    const { app } = appFor(db, settings)
    const created = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { authorization: `Bearer ${"a".repeat(43)}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Field notes" }),
    })
    expect(created.status).toBe(201)
    const project = (await created.json()) as { project: { id: string }; editorToken: string }
    const first = await app.request(`/api/v1/projects/${project.project.id}/sync/snapshot?limit=1`, {
      headers: { authorization: `Bearer ${project.editorToken}` },
    })
    const page = (await first.json()) as { entities: { entityId: string }[]; hasMore: boolean; nextCursor: string | null }
    expect(page.entities).toHaveLength(1)
    expect(page.hasMore).toBe(false)

    const live = await app.request("/health/live")
    expect(live.status).toBe(200)
    const caps = await app.request("/api/v1/capabilities")
    const capabilities = (await caps.json()) as { pushCommands: boolean; schemaVersion: number }
    expect(capabilities.pushCommands).toBe(false)
    expect(capabilities.schemaVersion).toBe(1)
  })
})
