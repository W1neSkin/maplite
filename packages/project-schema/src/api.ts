export const API_PREFIX = "/api/v1"

export type ApiErrorBody = {
  code: string
  message: string
  details?: unknown
  requestId?: string
}

export type ProjectSummary = {
  id: string
  name: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export type Capabilities = {
  schemaVersion: number
  pushCommands: boolean
  tileProxy: boolean
  demoLiveStream: boolean
  positionHistoryLimit: number
  trackRetentionDays: number
}

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Cartographic Workspace API",
    version: "0.1.0",
    description: "Project sync, live positions, devices, and file exchange. Coordinates are OGC:CRS84 longitude, latitude.",
  },
  paths: {
    "/health/live": { get: { summary: "Process is up" } },
    "/health/ready": { get: { summary: "Database is migrated and writable" } },
    "/api/v1/capabilities": { get: { summary: "Feature flags for this server" } },
    "/api/v1/projects": { get: { summary: "List projects" }, post: { summary: "Create a project" } },
    "/api/v1/projects/{projectId}/sync/push": { post: { summary: "Apply sync operations" } },
    "/api/v1/projects/{projectId}/sync/changes": { get: { summary: "Changes after a cursor" } },
    "/api/v1/projects/{projectId}/sync/snapshot": { get: { summary: "Current entities, paginated" } },
    "/api/v1/projects/{projectId}/events": { get: { summary: "Server-sent events: changes-available, positions-available" } },
    "/api/v1/projects/{projectId}/enrollments": { post: { summary: "Create a one-time device enrollment code" } },
    "/api/v1/enrollments/redeem": { post: { summary: "Exchange an enrollment code for a device token" } },
    "/api/v1/live-objects/{objectId}/positions": { post: { summary: "Publish one live position" } },
    "/api/v1/projects/{projectId}/positions": { get: { summary: "Live positions after a cursor" } },
  },
} as const
