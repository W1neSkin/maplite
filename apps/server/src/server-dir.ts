import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Package root of the server.
 *
 * This file has to stay directly under src/. `tsx` runs it from src/, and the
 * esbuild bundle is dist/index.js. Both are one directory below the package,
 * so ".." is the server package in development and in production.
 */
export function serverDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..")
}
