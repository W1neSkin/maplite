import { useState } from "react"
import { PRODUCT_NAME } from "../brand.js"
import { t } from "../i18n/translate.js"
import { redeemCode } from "../sync/channel.js"
import { clientId, saveSession, type Session } from "./connection.js"
import { ScanCode } from "./scan-code.js"
import { defaultDeviceName, rememberDeviceLabel } from "./use-live.js"

/** The phone's first screen. Scanning the computer's code joins and is remembered. */
export function PhoneConnect(props: { onConnected: (session: Session) => void }) {
  const [joining, setJoining] = useState(false)
  const [failed, setFailed] = useState(false)
  const [scanKey, setScanKey] = useState(0)

  function join(code: string, serverUrl: string | null) {
    if (!serverUrl) {
      setFailed(true)
      setScanKey((key) => key + 1)
      return
    }
    setFailed(false)
    setJoining(true)
    // A separate timer so a slow name lookup cannot cancel the join itself.
    const limit = (ms: number) => {
      const expired = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
      expired.catch(() => {})
      return expired
    }
    void (async () => {
      let name = "Phone"
      try {
        name = await Promise.race([defaultDeviceName(), limit(2_500)])
      } catch {
        name = "Phone"
      }
      const blank: Session = { server: serverUrl, token: "", role: "project", projectId: null, kind: null, deviceId: null }
      try {
        const issued = await Promise.race([redeemCode(blank, code, clientId(), name), limit(12_000)])
        if (!issued) {
          setFailed(true)
          setScanKey((key) => key + 1)
          return
        }
        rememberDeviceLabel(name)
        const next: Session = { ...blank, token: issued.token, projectId: issued.projectId, kind: "device", deviceId: issued.deviceId }
        saveSession(next, true)
        props.onConnected(next)
      } catch {
        setFailed(true)
        setScanKey((key) => key + 1)
      } finally {
        setJoining(false)
      }
    })()
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <h1 className="text-2xl font-semibold">{PRODUCT_NAME}</h1>
      {joining ? <p>{t("joining")}</p> : <ScanCode key={scanKey} onClose={() => setScanKey((key) => key + 1)} onCode={join} />}
      {failed ? <p role="status">{t("joinFailed")}</p> : null}
    </main>
  )
}
