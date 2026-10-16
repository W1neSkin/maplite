import { useState } from "react"
import { PRODUCT_NAME } from "../brand.js"
import { Button } from "../components/ui/button.js"
import { t } from "../i18n/translate.js"
import { readSessionRole } from "../sync/api.js"
import { DEFAULT_SERVER_URL, saveSession, type Session } from "./connection.js"

type ConnectProps = {
  onConnected: (session: Session) => void
}

export function ConnectScreen({ onConnected }: ConnectProps) {
  const [server, setServer] = useState(DEFAULT_SERVER_URL)
  const [token, setToken] = useState("")
  const [remember, setRemember] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const insecure = window.isSecureContext && server.trim().startsWith("http:")

  async function connect(nextToken: string, nextServer: string) {
    setMessage(null)
    try {
      const role = await readSessionRole(nextServer, nextToken)
      const session: Session = { server: nextServer, token: nextToken, role: role.role, projectId: role.projectId, kind: role.kind, deviceId: role.deviceId }
      saveSession(session, remember)
      onConnected(session)
    } catch (error) {
      const code = error instanceof Error ? error.message : ""
      setMessage(code === "auth" ? t("invalidToken") : t("serverUnavailable"))
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{PRODUCT_NAME}</h1>
      <p>{t("connectTitle")}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void connect(token.trim(), server.trim())
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t("serverAddress")}
          <input className="min-h-12 rounded-md border border-[var(--border)] px-3" value={server} onChange={(event) => setServer(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("projectToken")}
          <input className="min-h-12 rounded-md border border-[var(--border)] px-3" value={token} onChange={(event) => setToken(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          {t("rememberToken")}
        </label>
        {remember ? <p className="text-sm text-neutral-700">{t("rememberWarning")}</p> : null}
        {insecure ? <p role="status">{t("insecureServer")}</p> : null}
        {message ? <p role="status">{message}</p> : null}
        <Button type="submit">{t("connect")}</Button>
      </form>
      <Button
        variant="quiet"
        onClick={() => {
          void fetch(`${server.trim()}/api/v1/dev/bootstrap`)
            .then(async (response) => {
              if (!response.ok) throw new Error("server")
              const body = (await response.json()) as { editorToken: string; projectId: string }
              const session: Session = { server: server.trim(), token: body.editorToken, role: "project", projectId: body.projectId, kind: "editor", deviceId: null }
              saveSession(session, remember)
              onConnected(session)
            })
            .catch(() => setMessage(t("serverUnavailable")))
        }}
      >
        {t("useLocalDemo")}
      </Button>
    </main>
  )
}
