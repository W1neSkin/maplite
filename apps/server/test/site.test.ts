import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { loadConfig } from "../src/config.js"
import { migrate } from "../src/db/migrate.js"
import { openDatabase } from "../src/db/open.js"
import { attachSite } from "../src/site.js"

const migrationsDir = resolve(fileURLToPath(new URL("..", import.meta.url)), "migrations")
const temp = mkdtempSync(join(tmpdir(), "cartography-site-"))

afterAll(() => {
  rmSync(temp, { recursive: true, force: true })
})

function hostedApp() {
  const site = join(temp, "public")
  mkdirSync(join(site, "assets"), { recursive: true })
  writeFileSync(join(site, "index.html"), "<title>Map</title>")
  writeFileSync(join(site, "assets", "app.js"), "console.log(1)")
  const db = openDatabase(":memory:")
  migrate(db, migrationsDir)
  const app = createApp(db, loadConfig({
    NODE_ENV: "test",
    SEED_DEMO: "false",
    ALLOW_DEV_CREDENTIALS_FILE: "false",
    DATABASE_PATH: ":memory:",
    ADMIN_TOKEN: "a".repeat(43),
  }), { migrationsDir })
  attachSite(app, site)
  return app
}

describe("hosted map page", () => {
  const app = hostedApp()

  it("serves the page at the public address", async () => {
    const page = await app.request("http://map.example:25835/")
    expect(page.status).toBe(200)
    expect(await page.text()).toContain("Map")
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'")
  })

  it("serves the page script", async () => {
    const script = await app.request("http://map.example:25835/assets/app.js")
    expect(script.status).toBe(200)
    expect(await script.text()).toContain("console.log")
  })

  it("keeps the API on its own policy", async () => {
    const health = await app.request("http://map.example:25835/health/live")
    expect(health.status).toBe(200)
    expect(health.headers.get("content-security-policy")).toContain("default-src 'none'")
  })
})
