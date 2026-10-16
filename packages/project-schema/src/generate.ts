import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { openApiDocument } from "./api.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const destination = resolve(root, "schemas/openapi.json")
mkdirSync(dirname(destination), { recursive: true })
writeFileSync(destination, `${JSON.stringify(openApiDocument, null, 2)}\n`)
console.log(destination)
