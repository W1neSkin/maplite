import { useEffect, useState } from "react"
import { t } from "../i18n/translate.js"
import { readDevices, type DeviceRow } from "../sync/channel.js"
import type { Session } from "./connection.js"
import { CheckIcon, IconButton } from "./icons.js"

export function SendPanel(props: { session: Session; onSend: (audience: "all" | string[]) => Promise<boolean> }) {
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [all, setAll] = useState(true)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void readDevices(props.session).then(setDevices)
  }, [props.session])
  const audience: "all" | string[] = all ? "all" : [...picked]
  const ready = all || picked.size > 0
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready || busy) return
        setBusy(true)
        void props.onSend(audience).finally(() => setBusy(false))
      }}
    >
      <p className="text-xs text-neutral-500">{t("sendHelp")}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={all} onChange={(event) => setAll(event.target.checked)} />
        {t("allDevices")}
      </label>
      {devices.length === 0 ? <p className="text-sm text-neutral-500">{t("noDevices")}</p> : null}
      <ul className="flex flex-col">
        {devices.map((device) => (
          <li key={device.id}>
            <label className="flex h-8 items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={all}
                checked={all || picked.has(device.id)}
                onChange={(event) => {
                  setPicked((current) => {
                    const next = new Set(current)
                    if (event.target.checked) next.add(device.id)
                    else next.delete(device.id)
                    return next
                  })
                }}
              />
              <span className="truncate">{device.displayName}</span>
            </label>
          </li>
        ))}
      </ul>
      <IconButton tone="accent" type="submit" aria-label={t("sendLayer")} title={t("sendLayer")} disabled={!ready || busy}>
        <CheckIcon />
      </IconButton>
    </form>
  )
}
