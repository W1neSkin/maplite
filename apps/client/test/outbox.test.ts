import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createId, type PushResponse, type SyncOperation } from "@cartography/project-schema"
import { createRequire } from "node:module"
import { flushOutbox, migrateLocal, pendingOps, queueEdit, type Sql } from "../src/platform/native/sync-engine.js"

const require = createRequire(import.meta.url)
const Database = require("better-sqlite3") as typeof import("better-sqlite3")

function open(path: string): { sql: Sql; close: () => void } {
  const db = new Database(path)
  const sql: Sql = {
    exec: (statement) => db.exec(statement),
    run: (statement, params = []) => {
      db.prepare(statement).run(...params)
    },
    get: (statement, params = []) => db.prepare(statement).get(...params) as never,
    all: (statement, params = []) => db.prepare(statement).all(...params) as never[],
    transaction: (fn) => db.transaction(fn)(),
  }
  return { sql, close: () => db.close() }
}

describe("outbox", () => {
  const directory = mkdtempSync(join(tmpdir(), "cartography-outbox-"))
  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  it("keeps an offline edit across a restart and sends that operation once", async () => {
    const path = join(directory, "local.sqlite")
    const operation: SyncOperation = {
      opId: createId(),
      clientId: "phone",
      projectId: "project",
      entityType: "feature",
      entityId: createId(),
      kind: "create",
      baseVersion: null,
      payload: { name: "Gate" },
    }
    const first = open(path)
    migrateLocal(first.sql)
    queueEdit(first.sql, { entityType: "feature", entityId: operation.entityId, version: 0, deleted: false, payload: operation.payload }, operation)
    first.close()

    const second = open(path)
    expect(pendingOps(second.sql)).toHaveLength(1)
    const applied = new Set<string>()
    let lostResponse = true
    const push = async (operations: SyncOperation[]): Promise<PushResponse> => {
      const results = operations.map((op) => {
        if (applied.has(op.opId)) return { opId: op.opId, status: "duplicate" as const, version: 1, changeSeq: 1 }
        applied.add(op.opId)
        return { opId: op.opId, status: "applied" as const, version: 1, changeSeq: 1 }
      })
      if (lostResponse) {
        lostResponse = false
        throw new Error("timeout")
      }
      return { results, watermark: 1, schemaVersion: 1 }
    }
    expect(await flushOutbox(second.sql, push)).toBe("offline")
    expect(pendingOps(second.sql)).toHaveLength(1)
    expect(await flushOutbox(second.sql, push)).toBe("ok")
    expect(pendingOps(second.sql)).toHaveLength(0)
    expect(applied.size).toBe(1)
    second.close()
  })
})
