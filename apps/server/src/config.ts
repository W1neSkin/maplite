import { dirname, resolve } from "node:path"

export type ServerConfig = {
  host: string
  port: number
  nodeEnv: string
  databasePath: string
  publicBaseUrl: string
  adminToken: string | null
  corsOrigins: string[]
  basemapTileUrl: string
  tileProxy: boolean
  maxImportBytes: number
  maxFeaturesPerImport: number
  maxVerticesPerImport: number
  positionHistoryLimit: number
  trackRetentionDays: number
  demoLiveStream: boolean
  seedDemo: boolean
  allowDevCredentialsFile: boolean
  devCredentialsPath: string
  pushCommands: boolean
}

function flag(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const value = env[name]
  if (value === undefined || value === "") return fallback
  return value === "true" || value === "1"
}

function credentialsPath(databasePath: string): string {
  if (databasePath === ":memory:") return resolve("data", "dev-credentials.json")
  return resolve(dirname(databasePath), "dev-credentials.json")
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? "development"
  const production = nodeEnv === "production"
  const adminToken = env.ADMIN_TOKEN?.trim() || null
  if (production && (!adminToken || adminToken.length < 43)) {
    throw new Error("ADMIN_TOKEN must be at least 43 characters when NODE_ENV=production")
  }
  const databasePath = env.DATABASE_PATH ?? "./data/cartography.sqlite"
  const port = Number(env.PORT ?? 3847)
  if (!Number.isInteger(port) || port < 1) throw new Error("PORT must be a positive integer")
  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    nodeEnv,
    databasePath,
    publicBaseUrl: env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${port}`,
    adminToken,
    corsOrigins: (env.CORS_ORIGINS ?? "http://127.0.0.1:3848,http://localhost:3848,https://localhost,capacitor://localhost")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    basemapTileUrl: env.BASEMAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileProxy: flag(env, "TILE_PROXY", true),
    maxImportBytes: Number(env.MAX_IMPORT_BYTES ?? 52_428_800),
    maxFeaturesPerImport: Number(env.MAX_FEATURES_PER_IMPORT ?? 5000),
    maxVerticesPerImport: Number(env.MAX_VERTICES_PER_IMPORT ?? 200_000),
    positionHistoryLimit: Number(env.POSITION_HISTORY_LIMIT ?? 40),
    trackRetentionDays: Number(env.TRACK_RETENTION_DAYS ?? 30),
    demoLiveStream: flag(env, "DEMO_LIVE_STREAM", false),
    seedDemo: flag(env, "SEED_DEMO", true),
    // A public server must not hand the editor token to whoever asks.
    allowDevCredentialsFile: production ? false : flag(env, "ALLOW_DEV_CREDENTIALS_FILE", true),
    devCredentialsPath: env.DEV_CREDENTIALS_PATH ?? credentialsPath(databasePath),
    pushCommands: Boolean(env.FCM_PROJECT_ID || env.APNS_KEY_ID),
  }
}
