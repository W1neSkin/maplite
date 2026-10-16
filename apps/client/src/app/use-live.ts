import { geodesicLength } from "@cartography/geo-core"
import { createId } from "@cartography/project-schema"
import { useEffect, useState } from "react"
import { clientId, editOrigin, type Session } from "./connection.js"
import { publishLive, readLive, type LiveMessage } from "../sync/channel.js"
import { watchChanges } from "../sync/api.js"

const SHARE_KEY = "cartography.shareLive"
const HIDE_KEY = "cartography.liveHidden"
const NAME_KEY = "cartography.deviceName"
const FRESH_MS = 30_000
const DROP_MS = 120_000
const HEARTBEAT_MS = 20_000

export type LiveMarker = { id: string; name: string; coordinate: [number, number]; faded: boolean }
export type LivePerson = { id: string; name: string; shown: boolean }

function readSet(key: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown
    return new Set(Array.isArray(raw) ? raw.filter((item) => typeof item === "string") : [])
  } catch {
    return new Set()
  }
}

export function deviceLabel(): string {
  return localStorage.getItem(NAME_KEY)?.trim() || "Phone"
}

export function rememberDeviceLabel(name: string): void {
  localStorage.setItem(NAME_KEY, name)
}

/** The enrolled phone publishes as its device id. A demo phone uses the local client id. */
export function liveSubjectId(session: Session): string {
  return session.kind === "device" && session.deviceId ? session.deviceId : clientId()
}

function movedEnough(previous: [number, number], next: [number, number], accuracy: number | null): boolean {
  return geodesicLength([previous, next]) > Math.max(15, accuracy ?? 0)
}

function deviceMessages(messages: readonly LiveMessage[], now: number, hidden: ReadonlySet<string>, selfId: string): { markers: LiveMarker[]; people: LivePerson[] } {
  const markers: LiveMarker[] = []
  const people: LivePerson[] = []
  for (const message of messages) {
    if (message.type !== "device" || message.id === selfId) continue
    const longitude = message.body.longitude
    const latitude = message.body.latitude
    if (typeof longitude !== "number" || typeof latitude !== "number") continue
    const age = now - Date.parse(message.receivedAt)
    if (!Number.isFinite(age) || age > DROP_MS) continue
    const name = typeof message.body.name === "string" && message.body.name.trim() ? message.body.name : message.id
    const shown = !hidden.has(message.id)
    people.push({ id: message.id, name, shown })
    if (shown) markers.push({ id: message.id, name, coordinate: [longitude, latitude], faded: age > FRESH_MS })
  }
  return { markers, people }
}

export function useLive(session: Session) {
  const surface = editOrigin().surface
  const subjectId = liveSubjectId(session)
  const [sharing, setSharingState] = useState(() => surface === "device" && localStorage.getItem(SHARE_KEY) === "1")
  const [hidden, setHidden] = useState<Set<string>>(() => readSet(HIDE_KEY))
  const [messages, setMessages] = useState<LiveMessage[]>([])
  const [now, setNow] = useState(() => Date.now())

  function setSharing(value: boolean) {
    localStorage.setItem(SHARE_KEY, value ? "1" : "0")
    setSharingState(value)
  }

  function togglePerson(id: string) {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(HIDE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const load = () => void readLive(session).then(setMessages)
    load()
    void watchChanges(session, controller.signal, (event) => {
      if (event === "positions-available") load()
    })
    const timer = window.setInterval(load, 10_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [session])

  useEffect(() => {
    if (surface !== "device") return
    if (!sharing) {
      void publishLive(session, { id: subjectId, fixId: createId(), sampledAt: new Date().toISOString(), body: { sharing: false, name: deviceLabel() } })
      return
    }
    if (!navigator.geolocation) return
    let last: { coordinate: [number, number]; accuracy: number | null; speed: number | null; course: number | null; sentAt: number } | null = null
    const send = (coordinate: [number, number], accuracy: number | null, speed: number | null, course: number | null, sampledAt: string) => {
      last = { coordinate, accuracy, speed, course, sentAt: Date.now() }
      void publishLive(session, {
        id: subjectId,
        fixId: createId(),
        sampledAt,
        body: { name: deviceLabel(), sharing: true, longitude: coordinate[0], latitude: coordinate[1], horizontalAccuracyM: accuracy, speedMps: speed, courseDeg: course },
      })
    }
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const coordinate: [number, number] = [position.coords.longitude, position.coords.latitude]
        const accuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
        if (last && !movedEnough(last.coordinate, coordinate, accuracy) && Date.now() - last.sentAt < HEARTBEAT_MS) return
        send(coordinate, accuracy, position.coords.speed, position.coords.heading, new Date(position.timestamp).toISOString())
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
    const timer = window.setInterval(() => {
      if (!last || Date.now() - last.sentAt < HEARTBEAT_MS) return
      send(last.coordinate, last.accuracy, last.speed, last.course, new Date().toISOString())
    }, 5000)
    return () => {
      navigator.geolocation.clearWatch(watch)
      window.clearInterval(timer)
      void publishLive(session, { id: subjectId, fixId: createId(), sampledAt: new Date().toISOString(), body: { sharing: false, name: deviceLabel() } })
    }
  }, [session, sharing, subjectId, surface])

  const view = deviceMessages(messages, now, hidden, subjectId)
  return { sharing, setSharing, togglePerson, markers: view.markers, people: view.people, surface }
}
