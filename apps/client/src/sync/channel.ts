import type { Session } from "../app/connection.js"

export type LiveMessage = {
  type: string
  id: string
  receivedAt: string
  body: { name?: unknown; longitude?: unknown; latitude?: unknown; sharing?: unknown; courseDeg?: unknown; trail?: unknown }
}

export type DeviceRow = { id: string; displayName: string }

function auth(session: Session): HeadersInit {
  return { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }
}

export async function readLive(session: Session): Promise<LiveMessage[]> {
  if (!session.projectId) return []
  const response = await fetch(`${session.server}/api/v1/projects/${session.projectId}/live`, { headers: auth(session) })
  if (!response.ok) return []
  const body = (await response.json()) as { messages?: LiveMessage[] }
  return body.messages ?? []
}

export async function publishLive(session: Session, message: { id: string; fixId: string; sampledAt: string; body: Record<string, unknown> }): Promise<void> {
  if (!session.projectId) return
  await fetch(`${session.server}/api/v1/projects/${session.projectId}/live`, {
    method: "POST",
    headers: auth(session),
    body: JSON.stringify({ type: "device", deviceId: message.id, ...message }),
  })
}

export async function readDevices(session: Session): Promise<DeviceRow[]> {
  if (!session.projectId) return []
  const response = await fetch(`${session.server}/api/v1/projects/${session.projectId}/devices`, { headers: auth(session) })
  if (!response.ok) return []
  const body = (await response.json()) as { devices?: DeviceRow[] }
  return body.devices ?? []
}

export async function createEnrollment(session: Session): Promise<{ code: string; expiresAt: string } | null> {
  if (!session.projectId) return null
  const response = await fetch(`${session.server}/api/v1/projects/${session.projectId}/enrollments`, { method: "POST", headers: auth(session) })
  if (!response.ok) return null
  return (await response.json()) as { code: string; expiresAt: string }
}

export async function removeDevice(session: Session, deviceId: string): Promise<void> {
  if (!session.projectId) return
  await fetch(`${session.server}/api/v1/projects/${session.projectId}/devices/${deviceId}`, { method: "DELETE", headers: auth(session) })
}

export async function redeemCode(session: Session, code: string, deviceId: string, displayName: string): Promise<{ token: string; projectId: string; deviceId: string } | null> {
  const response = await fetch(`${session.server}/api/v1/enrollments/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, deviceId, platform: "android", displayName, appVersion: "0.1.0" }),
  })
  if (!response.ok) return null
  return (await response.json()) as { token: string; projectId: string; deviceId: string }
}
