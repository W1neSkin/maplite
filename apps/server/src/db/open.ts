import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type BetterSqlite from "better-sqlite3"

const require = createRequire(import.meta.url)
const Database = require("better-sqlite3") as typeof BetterSqlite

export type AppDatabase = BetterSqlite.Database

/**
 * One process writes this file. WAL lets a reader keep going during a sync
 * transaction. Do not point two server processes at the same file.
 */
export function openDatabase(path: string): AppDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  db.pragma("busy_timeout = 5000")
  return db
}
