import { useEffect, useState } from "react"
import { formatWhen } from "../i18n/format.js"
import { t } from "../i18n/translate.js"
import { createEnrollment, readDevices, redeemCode, removeDevice, type DeviceRow } from "../sync/channel.js"
import { clientId, saveSession, type Session } from "./connection.js"
import { BasemapPack } from "./basemap-pack.js"
import { CheckIcon, IconButton, PlusIcon, TrashIcon } from "./icons.js"
import { ShareLocation } from "../platform/share-location.js"
import { readLocalTrack } from "./track-store.js"
import { deviceLabel, rememberDeviceLabel } from "./use-live.js"

export function DevicesPanel(props: {
  session: Session
  surface: "main" | "device"
  sharing: boolean
  onSharing: (value: boolean) => void
  recording: boolean
  onRecording: (value: boolean) => void
  onSaveTrack: () => Promise<void>
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
      <BasemapPack />
      {props.surface === "device" ? <DeviceName /> : null}
      {props.surface === "device" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={props.sharing} onChange={(event) => props.onSharing(event.target.checked)} />
          {t("shareLive")}
        </label>
      ) : null}
      {props.surface === "device" ? <TrackRecord recording={props.recording} onRecording={props.onRecording} onSave={props.onSaveTrack} /> : null}
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
    </div>
  )
}

function TrackRecord(props: { recording: boolean; onRecording: (value: boolean) => void; onSave: () => Promise<void> }) {
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const load = () => {
      void ShareLocation.readTrack()
        .then((body) => setCount(body.points?.length ? body.points.length : readLocalTrack().length))
        .catch(() => setCount(readLocalTrack().length))
    }
    load()
    const timer = window.setInterval(load, 5000)
    return () => window.clearInterval(timer)
  }, [props.recording])
  return (
    <div className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <input type="checkbox" checked={props.recording} onChange={(event) => props.onRecording(event.target.checked)} />
        <span className="truncate">{t("recordTrack")}</span>
        {count > 0 ? <span className="shrink-0 text-xs text-neutral-500">{t("trackPoints", { count })}</span> : null}
      </label>
      <IconButton tone="accent" aria-label={t("saveTrack")} title={t("saveTrack")} disabled={busy || count < 2} onClick={() => { setBusy(true); void props.onSave().finally(() => setBusy(false)) }}>
        <CheckIcon />
      </IconButton>
    </div>
  )
}

function DeviceName() {
  const [name, setName] = useState(deviceLabel)
  function save(value: string) {
    const next = value.trim() || "Phone"
    setName(next)
    if (next !== deviceLabel()) rememberDeviceLabel(next)
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        save(name)
      }}
    >
      <label className="shrink-0 text-sm" htmlFor="device-name">{t("deviceName")}</label>
      <input
        id="device-name"
        aria-label={t("deviceName")}
        className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 text-sm"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => save(name)}
      />
    </form>
  )
}
