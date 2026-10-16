import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const skip = new Set(["node_modules", "dist", "coverage", "android", "ios", ".capacitor"])
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"'`]*?\s+from\s+)?["'`]([^"'`]+)["'`]/g
const dynamicPattern = /import\(\s*["'`]([^"'`]+)["'`]\s*\)/g
const errors = []

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, files)
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) files.push(path)
  }
  return files
}

function packageRoot(file) {
  let dir = dirname(file)
  while (dir.startsWith(root)) {
    if (existsSync(join(dir, "package.json"))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return root
}

function checkSpecifier(file, spec) {
  if (spec.startsWith("@cartography/")) {
    const name = spec.split("/").slice(0, 2).join("/")
    if (spec !== name) errors.push(`${file} imports ${spec}. Use the package root.`)
    return
  }
  if (!spec.startsWith(".")) return
  const target = resolve(dirname(file), spec)
  const from = packageRoot(file)
  const to = packageRoot(target)
  if (from !== to) errors.push(`${file} reaches into ${to} via ${spec}`)
}

for (const folder of ["apps", "packages", "extensions", "scripts"]) {
  for (const file of walk(join(root, folder))) {
    const text = readFileSync(file, "utf8")
    for (const match of text.matchAll(importPattern)) checkSpecifier(file, match[1])
    for (const match of text.matchAll(dynamicPattern)) checkSpecifier(file, match[1])
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"))
  process.exit(1)
}
console.log("package boundaries ok")
