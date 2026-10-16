import { useEffect, useState } from "react"
import { formatWhen } from "../i18n/format.js"
import { t } from "../i18n/translate.js"
import { createEnrollment, readDevices, redeemCode, removeDevice, type DeviceRow } from "../sync/channel.js"
import { clientId, saveSession, type Session } from "./connection.js"
import { EyeIcon, EyeOffIcon, IconButton, PlusIcon, TrashIcon } from "./icons.js"
import type { LivePerson } from "./use-live.js"
import { rememberDeviceLabel } from "./use-live.js"

export function DevicesPanel(props: {
  session: Session
  surface: "main" | "device"
  sharing: boolean
  onSharing: (value: boolean) => void
  people: readonly LivePerson[]
  onTogglePerson: (id: string) => void
  onJoined: (session: Session) => void
}) {
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [code, setCode] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState("")
  const [joinName, setJoinName] = useState("")
  const [joinFailed, setJoinFailed] = useState(false)

  function reload() {
    void readDevices(props.session).then(setDevices)
  }

  useEffect(() => {
    if (props.surface === "main") reload()
  }, [props.session, props.surface])

  return (
    <div className="flex flex-col gap-2">
      {props.surface === "device" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={props.sharing} onChange={(event) => props.onSharing(event.target.checked)} />
          {t("shareLive")}
        </label>
      ) : null}
      {props.surface === "main" ? (
        <>
          <div className="flex items-center gap-1">
            <IconButton
              tone="fill"
              aria-label={t("addDevice")}
              title={t("addDevice")}
              onClick={() => {
                void createEnrollment(props.session).then((issued) => {
                  if (!issued) return
                  setCode(issued.code)
                  setExpiresAt(issued.expiresAt)
                })
              }}
            >
              <PlusIcon />
            </IconButton>
            {code ? <span className="font-mono text-sm">{code}</span> : null}
          </div>
          {expiresAt ? <p className="text-xs text-neutral-500">{t("enrollmentExpires", { time: formatWhen(expiresAt) })}</p> : null}
          <ul className="flex flex-col">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center">
                <span className="min-w-0 flex-1 truncate px-1 text-sm">{device.displayName}</span>
                <IconButton aria-label={t("removeDevice")} title={t("removeDevice")} onClick={() => void removeDevice(props.session, device.id).then(reload)}>
                  <TrashIcon />
                </IconButton>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {props.surface === "device" && props.session.kind !== "device" ? (
        <form
          className="flex flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            const name = joinName.trim()
            if (!joinCode.trim() || !name) return
            setJoinFailed(false)
            void redeemCode(props.session, joinCode, clientId(), name).then((issued) => {
              if (!issued) {
                setJoinFailed(true)
                return
              }
              rememberDeviceLabel(name)
              const next: Session = { ...props.session, token: issued.token, projectId: issued.projectId, role: "project", kind: "device", deviceId: issued.deviceId }
              saveSession(next, true)
              props.onJoined(next)
            })
          }}
        >
          <input aria-label={t("deviceCode")} className="h-8 rounded-lg border border-[var(--border)] px-2 text-sm" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} />
          <div className="flex items-center gap-1">
            <input aria-label={t("deviceName")} className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 text-sm" value={joinName} onChange={(event) => setJoinName(event.target.value)} />
            <IconButton tone="accent" type="submit" aria-label={t("joinDevice")} title={t("joinDevice")} disabled={!joinCode.trim() || !joinName.trim()}>
              <PlusIcon />
            </IconButton>
          </div>
          {joinFailed ? <p className="text-xs text-neutral-500">{t("joinFailed")}</p> : null}
        </form>
      ) : null}
      {props.people.length > 0 ? <div className="px-1 text-[11px] uppercase tracking-wide text-neutral-400">{t("liveTitle")}</div> : null}
      <ul className="flex flex-col">
        {props.people.map((person) => (
          <li key={person.id} className="flex items-center">
            <IconButton aria-label={person.shown ? t("hideLayer") : t("showLayer")} title={person.shown ? t("hideLayer") : t("showLayer")} onClick={() => props.onTogglePerson(person.id)}>
              {person.shown ? <EyeIcon /> : <EyeOffIcon />}
            </IconButton>
            <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
