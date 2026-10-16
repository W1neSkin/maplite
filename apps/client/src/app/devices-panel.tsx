import { useEffect, useState } from "react"
import { formatWhen } from "../i18n/format.js"
import { t } from "../i18n/translate.js"
import { createEnrollment, readDevices, redeemCode, removeDevice, renameSelf, sendCommand, type DeviceRow } from "../sync/channel.js"
import { clientId, saveSession, type Session } from "./connection.js"
import { qrForPage } from "./enrollment.js"
import { deviceFace, nextMode } from "./device-status.js"
import { rememberRemote, remoteAllowed, reportLocal } from "./use-commands.js"
import { BasemapPack } from "./basemap-pack.js"
import { EnrollQr } from "./enroll-qr.js"
import { ScanCode } from "./scan-code.js"
import { CheckIcon, IconButton, TrashIcon } from "./icons.js"
import { ShareLocation } from "../platform/share-location.js"
import { readLocalTrack } from "./track-store.js"
import { defaultDeviceName, deviceLabel, rememberDeviceLabel } from "./use-live.js"

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
  const [qrText, setQrText] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [joinFailed, setJoinFailed] = useState(false)
  const [joining, setJoining] = useState(false)

  function reload() {
    void readDevices(props.session).then(setDevices)
  }

  function join(code: string, serverUrl: string | null) {
    const session = serverUrl ? { ...props.session, server: serverUrl } : props.session
    void defaultDeviceName().then((name) => {
    setJoinFailed(false)
    setJoining(true)
    void redeemCode(session, code, clientId(), name).then((issued) => {
      setJoining(false)
      if (!issued) {
        setJoinFailed(true)
        return
      }
      rememberDeviceLabel(name)
      const next: Session = { ...session, token: issued.token, projectId: issued.projectId, role: "project", kind: "device", deviceId: issued.deviceId }
      saveSession(next, true)
      props.onJoined(next)
    })
    })
  }

  useEffect(() => {
    if (props.surface !== "main") return
    reload()
    const timer = window.setInterval(reload, 10_000)
    return () => window.clearInterval(timer)
  }, [props.session, props.surface])

  return (
    <div className="flex flex-col gap-2">
      {scanning ? (
        <ScanCode
          onClose={() => setScanning(false)}
          onCode={(next, serverUrl) => {
            setScanning(false)
            join(next, serverUrl)
          }}
        />
      ) : null}
      {scanning ? null : <BasemapPack />}
      {props.surface === "device" && !scanning ? <DeviceName session={props.session} /> : null}
      {props.surface === "device" && !scanning ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={props.sharing} onChange={(event) => { props.onSharing(event.target.checked); reportLocal(props.session, event.target.checked, props.recording) }} />
          {t("shareLive")}
        </label>
      ) : null}
      {props.surface === "device" && !scanning ? <TrackRecord recording={props.recording} onRecording={(value) => { props.onRecording(value); reportLocal(props.session, props.sharing, value) }} onSave={props.onSaveTrack} /> : null}
      {props.surface === "device" && !scanning ? <RemoteSwitch /> : null}
      {props.surface === "main" ? (
        <>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="h-8 rounded-full bg-black/5 px-3 text-sm"
              onClick={() => {
                void createEnrollment(props.session).then((issued) => {
                  if (!issued) return
                  setQrText(qrForPage(issued.qrText))
                  setExpiresAt(issued.expiresAt)
                })
              }}
            >
              {t("addDevice")}
            </button>
          </div>
          {qrText ? <EnrollQr text={qrText} /> : null}
          {expiresAt ? <p className="text-xs text-neutral-500">{t("enrollmentExpires", { time: formatWhen(expiresAt) })}</p> : null}
          {devices.length === 0 ? <p className="px-1 text-xs text-neutral-500">{t("noDevices")}</p> : null}
          <ul className="flex flex-col">
            {devices.map((device) => (
              <DeviceControl key={device.id} session={props.session} device={device} onChanged={reload} />
            ))}
          </ul>
        </>
      ) : null}
      {props.surface === "device" && props.session.kind !== "device" && !scanning ? (
        <div className="flex flex-col gap-1">
          <button type="button" className="h-8 rounded-full bg-black/5 px-3 text-sm" disabled={joining} onClick={() => setScanning(true)}>{joining ? t("joining") : t("scanCode")}</button>
          {joinFailed ? <p className="px-1 text-xs text-neutral-500">{t("joinFailed")}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

const FACE = {
  pending: "devicePending",
  closed: "deviceClosed",
  permission: "devicePermission",
  remoteOff: "deviceRemoteOff",
  expired: "deviceExpired",
  off: "deviceOff",
  live: "deviceLive",
  track: "deviceRecording",
  both: "deviceBoth",
} as const

function DeviceControl(props: { session: Session; device: DeviceRow; onChanged: () => void }) {
  const face = deviceFace({
    desired: props.device.desiredState ?? "off",
    actual: props.device.actualState ?? "off",
    lastSeenAt: props.device.lastSeenAt ?? null,
    ackedAt: props.device.command?.ackedAt ?? null,
    result: props.device.command?.result ?? null,
    expiresAt: props.device.command?.expiresAt ?? null,
    now: Date.now(),
  })
  const desired = props.device.desiredState ?? "off"
  function send(button: "off" | "live" | "track") {
    void sendCommand(props.session, props.device.id, nextMode(desired, button)).then(() => props.onChanged())
  }
  return (
    <li className="flex flex-col gap-1 py-1">
      <div className="flex items-center">
        <span className="min-w-0 flex-1 truncate px-1 text-sm">{props.device.displayName}</span>
        <span className="shrink-0 px-1 text-xs text-neutral-500">{t(FACE[face])}</span>
        <IconButton aria-label={t("removeDevice")} title={t("removeDevice")} onClick={() => void removeDevice(props.session, props.device.id).then(() => props.onChanged())}>
          <TrashIcon />
        </IconButton>
      </div>
      <div className="flex gap-1 px-1">
        <ModeButton label={t("deviceOff")} pressed={desired === "off"} onClick={() => send("off")} />
        <ModeButton label={t("deviceLive")} pressed={desired === "live" || desired === "both"} onClick={() => send("live")} />
        <ModeButton label={t("deviceTrack")} pressed={desired === "track" || desired === "both"} onClick={() => send("track")} />
      </div>
    </li>
  )
}

function ModeButton(props: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" className={props.pressed ? "h-8 rounded-full bg-neutral-900 px-2 text-xs text-white" : "h-8 rounded-full bg-black/5 px-2 text-xs"} aria-pressed={props.pressed} onClick={props.onClick}>
      {props.label}
    </button>
  )
}

function RemoteSwitch() {
  const [allow, setAllow] = useState(remoteAllowed)
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={allow}
        onChange={(event) => {
          setAllow(event.target.checked)
          rememberRemote(event.target.checked)
        }}
      />
      {t("allowRemote")}
    </label>
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

function DeviceName(props: { session: Session }) {
  const [name, setName] = useState(deviceLabel)
  useEffect(() => {
    void defaultDeviceName().then((next) => {
      setName(next)
      if (props.session.kind === "device" && next !== "Phone") void renameSelf(props.session, next)
    })
  }, [props.session])
  function save(value: string) {
    const next = value.trim() || "Phone"
    setName(next)
    if (next !== deviceLabel()) {
      rememberDeviceLabel(next)
      if (props.session.kind === "device") void renameSelf(props.session, next)
    }
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
