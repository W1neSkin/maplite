import { SCHEMA_VERSION, type ChangesResponse, type PushResponse, type SnapshotEntity, type SnapshotResponse, type SyncOperation } from "@cartography/project-schema"
import type { Session } from "../app/connection.js"
import { pushBody } from "./edits.js"

function headers(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

export async function readPlace(session: Session, longitude: number, latitude: number, signal: AbortSignal): Promise<string> {
  const url = new URL(`${session.server}/api/v1/place`)
  url.searchParams.set("longitude", String(longitude))
  url.searchParams.set("latitude", String(latitude))
  url.searchParams.set("lang", navigator.language.split("-")[0] || "en")
  const response = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` }, signal })
  if (!response.ok) return ""
  const body = (await response.json()) as { label?: unknown }
  return typeof body.label === "string" ? body.label : ""
}

export async function readSessionRole(server: string, token: string): Promise<{ role: "admin" | "project"; projectId: string | null; kind: string | null; deviceId: string | null }> {
  const response = await fetch(`${server}/api/v1/session`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new Error("auth")
  if (!response.ok) throw new Error("server")
  const body = (await response.json()) as { role: "admin" | "project"; projectId?: string; kind?: string | null; deviceId?: string | null }
  return { role: body.role, projectId: body.projectId ?? null, kind: body.kind ?? null, deviceId: body.deviceId ?? null }
}

export async function readAll(session: Session): Promise<{ entities: SnapshotEntity[]; watermark: number; schemaVersion: number }> {
  if (!session.projectId) throw new Error("server")
  const entities: SnapshotEntity[] = []
  let cursor: string | null = null
  let watermark = 0
  let schemaVersion = SCHEMA_VERSION
  for (;;) {
    const url = new URL(`${session.server}/api/v1/projects/${session.projectId}/sync/snapshot`)
    url.searchParams.set("limit", "200")
    if (cursor) url.searchParams.set("cursor", cursor)
    const response = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` } })
    if (response.status === 401) throw new Error("auth")
    if (!response.ok) throw new Error("server")
    const page = (await response.json()) as SnapshotResponse
    entities.push(...page.entities)
    watermark = page.watermark
    schemaVersion = page.schemaVersion
    if (!page.hasMore || !page.nextCursor) break
    cursor = page.nextCursor
  }
  return { entities, watermark, schemaVersion }
}

export async function pushOps(session: Session, operations: SyncOperation[], atomic = false): Promise<PushResponse> {
  if (!session.projectId) throw new Error("server")
  const response = await fetch(`${session.server}/api/v1/projects/${session.projectId}/sync/push`, {
    method: "POST",
    headers: headers(session.token),
    body: JSON.stringify(pushBody(operations, atomic)),
  })
  if (response.status === 401) throw new Error("auth")
  if (response.status === 409) throw new Error("upgrade")
  if (!response.ok) throw new Error("server")
  return (await response.json()) as PushResponse
}

export async function readChanges(session: Session, after: number): Promise<ChangesResponse> {
  if (!session.projectId) throw new Error("server")
  const response = await fetch(`${session.server}/api/v1/projects/${session.projectId}/sync/changes?after=${after}&limit=200`, {
    headers: { Authorization: `Bearer ${session.token}` },
  })
  if (!response.ok) throw new Error(response.status === 401 ? "auth" : "server")
  return (await response.json()) as ChangesResponse
}

export async function watchChanges(session: Session, signal: AbortSignal, onEvent: (event: "changes-available" | "positions-available") => void): Promise<void> {
  if (!session.projectId) return
  while (!signal.aborted) {
    try {
      const response = await fetch(`${session.server}/api/v1/projects/${session.projectId}/events`, {
        headers: { Authorization: `Bearer ${session.token}`, Accept: "text/event-stream" },
        signal,
      })
      if (!response.ok || !response.body) throw new Error("stream")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        const parts = buffer.split("\n\n")
        buffer = parts.pop() ?? ""
        for (const part of parts) {
          const line = part.split("\n").find((item) => item.startsWith("event:"))
          const name = line?.slice("event:".length).trim()
          if (name === "changes-available" || name === "positions-available") onEvent(name)
        }
      }
    } catch {
      if (signal.aborted) return
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5_000)
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve() }, { once: true })
    })
  }
}
