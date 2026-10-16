import { join } from "node:path"
import { loadConfig } from "./config.js"
import { databaseReady, migrate } from "./db/migrate.js"
import { openDatabase } from "./db/open.js"
import { serverDir } from "./server-dir.js"

const command = process.argv[2]
if (command !== "migrate" && command !== "verify") {
  console.error("Use: migrate | verify")
  process.exit(1)
}

const dir = join(serverDir(), "migrations")
const db = openDatabase(loadConfig().databasePath)
const ran = migrate(db, dir)
const ready = databaseReady(db, dir)
if (command === "verify" && !ready) {
  console.error(JSON.stringify({ ready: false, ran }))
  process.exit(1)
}
console.log(JSON.stringify({ ready, ran }))
