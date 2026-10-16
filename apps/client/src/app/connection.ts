import type { EditOrigin } from "@cartography/project-schema"

const TOKEN_KEY = "cartography.editorToken"
const PROJECT_KEY = "cartography.projectId"
const SERVER_KEY = "cartography.serverUrl"
const CLIENT_KEY = "cartography.clientId"
const ADMIN_KEY = "cartography.admin"
const DEVICE_KEY = "cartography.deviceId"
const KIND_KEY = "cartography.tokenKind"

export const DEFAULT_SERVER_URL = "http://127.0.0.1:3847"

export type Session = {
  server: string
  token: string
  role: "admin" | "project"
  projectId: string | null
  kind: string | null
  deviceId: string | null
}

function storageGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

function storageSet(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value)
  } catch {
    // Private mode can refuse storage. The connect form still works for this tab.
  }
}

export function clientId(): string {
  const existing = storageGet(localStorage, CLIENT_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  storageSet(localStorage, CLIENT_KEY, created)
  return created
}

/** The phone app runs inside Capacitor. The browser on the computer is the main window. */
export function isPhoneApp(): boolean {
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (capacitor?.isNativePlatform?.() === true) return true
  // Android WebView adds "; wv)". A desktop browser does not.
  return typeof navigator !== "undefined" && /; wv\)/.test(navigator.userAgent)
}

export function editOrigin(): EditOrigin {
  return { surface: isPhoneApp() ? "device" : "main", deviceId: clientId() }
}

export function readSession(): Session | null {
  const token = storageGet(sessionStorage, TOKEN_KEY) ?? storageGet(localStorage, TOKEN_KEY)
  if (!token) return null
  const server = storageGet(localStorage, SERVER_KEY) ?? DEFAULT_SERVER_URL
  const admin = storageGet(sessionStorage, ADMIN_KEY) === "1" || storageGet(localStorage, ADMIN_KEY) === "1"
  const projectId = storageGet(sessionStorage, PROJECT_KEY) ?? storageGet(localStorage, PROJECT_KEY)
  if (!admin && !projectId) return null
  return {
    server,
    token,
    role: admin && !projectId ? "admin" : "project",
    projectId,
    kind: storageGet(localStorage, KIND_KEY),
    deviceId: storageGet(localStorage, DEVICE_KEY),
  }
}

/** Tokens stay in session storage unless the user asks to remember them. */
export function saveSession(session: Session, remember: boolean): void {
  storageSet(sessionStorage, TOKEN_KEY, session.token)
  storageSet(sessionStorage, ADMIN_KEY, session.role === "admin" && !session.projectId ? "1" : "0")
  if (session.projectId) storageSet(sessionStorage, PROJECT_KEY, session.projectId)
  else sessionStorage.removeItem(PROJECT_KEY)
  storageSet(localStorage, SERVER_KEY, session.server)
  if (session.deviceId) storageSet(localStorage, DEVICE_KEY, session.deviceId)
  else localStorage.removeItem(DEVICE_KEY)
  if (session.kind) storageSet(localStorage, KIND_KEY, session.kind)
  else localStorage.removeItem(KIND_KEY)
  if (!remember) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PROJECT_KEY)
    localStorage.removeItem(ADMIN_KEY)
    return
  }
  storageSet(localStorage, TOKEN_KEY, session.token)
  storageSet(localStorage, ADMIN_KEY, session.role === "admin" && !session.projectId ? "1" : "0")
  if (session.projectId) storageSet(localStorage, PROJECT_KEY, session.projectId)
}

export function clearSession(): void {
  for (const key of [TOKEN_KEY, PROJECT_KEY, ADMIN_KEY, DEVICE_KEY, KIND_KEY]) {
    sessionStorage.removeItem(key)
    localStorage.removeItem(key)
  }
}
