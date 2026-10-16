import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const catalogPath = join(root, "apps/client/src/i18n/en.ts")
const errors = []
const skip = new Set(["node_modules", "dist", "coverage", "android", "ios", ".capacitor"])

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, files)
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) files.push(path)
  }
  return files
}

const catalog = readFileSync(catalogPath, "utf8")
const keys = new Set([...catalog.matchAll(/^\s+([A-Za-z][A-Za-z0-9]*)\s*:/gm)].map((match) => match[1]))
if (keys.size === 0) errors.push("English catalog has no keys")

for (const folder of ["apps", "packages", "extensions", "scripts"]) {
  for (const file of walk(join(root, folder))) {
    const text = readFileSync(file, "utf8")
    if (/[\u0401\u0451\u0410-\u044F]/.test(text)) errors.push(`${file} contains Cyrillic`)
  }
}

const clientDir = join(root, "apps/client/src")
for (const file of walk(clientDir)) {
  const text = readFileSync(file, "utf8")
  for (const match of text.matchAll(/\bt\(\s*["']([A-Za-z0-9]+)["']/g)) {
    if (!keys.has(match[1])) errors.push(`${file} uses missing message ${match[1]}`)
  }
  if (!file.endsWith(".tsx")) continue
  const source = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const match of source.matchAll(/>\s*([A-Z][a-z]+(?:\s+[A-Za-z][a-z]+)+)\s*</g)) {
    errors.push(`${file} has raw interface text: ${match[1]}`)
  }
  for (const match of source.matchAll(/\b(?:aria-label|title|placeholder|alt)\s*=\s*["']([^"']+)["']/g)) {
    errors.push(`${file} has raw attribute text: ${match[1]}`)
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"))
  process.exit(1)
}
console.log(`english catalog ok (${keys.size} keys)`)
