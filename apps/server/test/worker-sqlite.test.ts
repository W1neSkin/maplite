import { describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { loadConfig } from "../src/config.js"
import { runPendingMigrations } from "../src/db/migrate.js"
import { openDatabase } from "../src/db/open.js"
import { LATEST_WORKER_MIGRATION, WORKER_MIGRATIONS, openWorkerDatabase } from "../../../cloudflare/sqlite.js"

describe("worker sqlite adapter", () => {
  it("runs the server routes against the Durable Object SQLite shape", async () => {
    const raw = openDatabase(":memory:")
    const db = openWorkerDatabase({
      sql: {
        exec(query: string, ...bindings: unknown[]) {
          if (bindings.length === 0 && query.trim().includes(";")) {
            raw.exec(query)
            return { toArray: () => [] }
          }
          const stmt = raw.prepare(query)
          if (stmt.reader) {
            const rows = stmt.all(...bindings) as Record<string, unknown>[]
            return { toArray: () => rows }
          }
          stmt.run(...bindings)
          return { toArray: () => [] }
        },
      },
      transactionSync(callback) {
        return raw.transaction(callback)()
      },
    })
    expect(runPendingMigrations(db, WORKER_MIGRATIONS)).toEqual(["001_init", "002_device_app_version"])
    const adminToken = "c".repeat(43)
    const config = loadConfig({
      NODE_ENV: "production",
      ADMIN_TOKEN: adminToken,
      PUBLIC_BASE_URL: "https://maplite.map.example",
      SEED_DEMO: "false",
      ALLOW_DEV_CREDENTIALS_FILE: "false",
    })
    const app = createApp(db, config, { migrationsDir: LATEST_WORKER_MIGRATION })

    const ready = await app.request("/health/ready")
    expect(ready.status).toBe(200)

    const created = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Field" }),
    })
    expect(created.status).toBe(201)
    const { project } = (await created.json()) as { project: { id: string } }

    const enroll = await app.request(`/api/v1/projects/${project.id}/enrollments`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(enroll.status).toBe(201)
    const { code } = (await enroll.json()) as { code: string }

    const redeemed = await app.request("/api/v1/enrollments/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceId: "phone-1", platform: "android", displayName: "Samsung", appVersion: "0.1.0" }),
    })
    expect(redeemed.status).toBe(200)

    const again = await app.request("/api/v1/enrollments/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceId: "phone-2", platform: "android", displayName: "Other", appVersion: "0.1.0" }),
    })
    expect(again.status).toBe(401)
  })
})
