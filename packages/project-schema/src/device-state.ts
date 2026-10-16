export type DesiredMode = "off" | "live" | "track"
export type ActualMode = "off" | "starting" | "live" | "tracking" | "permissionDenied" | "appTerminated" | "offline" | "error"
export type TrackProfileName = "economy" | "balanced" | "precise"

export type TrackProfile = {
  name: TrackProfileName
  intervalMs: number
  distanceM: number
  accuracyM: number
  heartbeatMs: number
}

export const TRACK_PROFILES: Record<TrackProfileName, TrackProfile> = {
  economy: { name: "economy", intervalMs: 60_000, distanceM: 25, accuracyM: 50, heartbeatMs: 120_000 },
  balanced: { name: "balanced", intervalMs: 15_000, distanceM: 8, accuracyM: 20, heartbeatMs: 45_000 },
  precise: { name: "precise", intervalMs: 5_000, distanceM: 3, accuracyM: 10, heartbeatMs: 20_000 },
}

export type DeviceCommandBody = {
  commandId: string
  desired: DesiredMode
  profile: TrackProfileName
  expiresAt: string
  autoStopAt: string | null
}

export function commandExpired(expiresAt: string, nowMs = Date.now()): boolean {
  return Date.parse(expiresAt) <= nowMs
}

export function actualAfterAck(desired: DesiredMode): ActualMode {
  if (desired === "off") return "off"
  if (desired === "live") return "live"
  return "tracking"
}

export function actualAfterFailure(reason: "permission" | "terminated" | "offline" | "blocked" | "error"): ActualMode {
  if (reason === "permission") return "permissionDenied"
  if (reason === "terminated") return "appTerminated"
  if (reason === "offline") return "offline"
  return "error"
}
