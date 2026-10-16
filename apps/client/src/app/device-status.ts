/** No contact for this long means the phone is not running the app or the service. */
export const DEVICE_QUIET_MS = 50_000

export type DeviceFace = "pending" | "closed" | "permission" | "remoteOff" | "expired" | "off" | "live" | "track" | "both"

export function deviceFace(input: {
  desired: string
  actual: string
  lastSeenAt: string | null
  ackedAt: string | null
  result: string | null
  expiresAt: string | null
  now: number
}): DeviceFace {
  const seen = input.lastSeenAt ? Date.parse(input.lastSeenAt) : Number.NaN
  if (!Number.isFinite(seen) || input.now - seen > DEVICE_QUIET_MS) return "closed"
  if (input.result === "permissionDenied") return "permission"
  if (input.result === "remoteOff") return "remoteOff"
  const expires = input.expiresAt ? Date.parse(input.expiresAt) : Number.NaN
  if (!input.ackedAt && Number.isFinite(expires)) return input.now <= expires ? "pending" : "expired"
  if (input.actual === "live" || input.actual === "track" || input.actual === "both" || input.actual === "off") return input.actual
  if (input.desired === "live" || input.desired === "track" || input.desired === "both") return input.desired
  return "off"
}

/** Live and track are separate switches. Off clears both. */
export function nextMode(current: string, button: "off" | "live" | "track"): "off" | "live" | "track" | "both" {
  if (button === "off") return "off"
  const share = current === "live" || current === "both"
  const record = current === "track" || current === "both"
  const nextShare = button === "live" ? !share : share
  const nextRecord = button === "track" ? !record : record
  if (nextShare && nextRecord) return "both"
  if (nextShare) return "live"
  if (nextRecord) return "track"
  return "off"
}

export function modeOf(share: boolean, record: boolean): "off" | "live" | "track" | "both" {
  if (share && record) return "both"
  if (share) return "live"
  if (record) return "track"
  return "off"
}
