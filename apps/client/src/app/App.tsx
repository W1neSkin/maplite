import { useState } from "react"
import { AdminScreen } from "./AdminScreen.js"
import { clearSession, phoneNeedsJoin, readSession, saveSession, type Session } from "./connection.js"
import { ConnectScreen } from "./ConnectScreen.js"
import { PhoneConnect } from "./phone-connect.js"
import { ProjectScreen } from "./ProjectScreen.js"

export function App() {
  const [session, setSession] = useState<Session | null>(() => readSession())
  const [fromAdmin, setFromAdmin] = useState(false)

  if (phoneNeedsJoin(session)) return <PhoneConnect onConnected={setSession} />
  if (!session) return <ConnectScreen onConnected={setSession} />
  if (!session.projectId) {
    return (
      <AdminScreen
        session={session}
        onDisconnect={() => {
          clearSession()
          setSession(null)
        }}
        onOpen={(projectId, token) => {
          const next = { ...session, token, role: "project" as const, projectId, kind: "editor", deviceId: null }
          setFromAdmin(true)
          setSession(next)
        }}
      />
    )
  }
  return (
    <ProjectScreen
      session={session}
      onDisconnect={() => {
        clearSession()
        setFromAdmin(false)
        setSession(null)
      }}
      onJoined={setSession}
      onBack={
        fromAdmin
          ? () => {
              const next = { ...session, role: "admin" as const, projectId: null, kind: null, deviceId: null }
              saveSession(next, false)
              setFromAdmin(false)
              setSession(next)
            }
          : null
      }
    />
  )
}
