import type { Feature } from "@cartography/project-schema"
import { useEffect, useState } from "react"
import { Button } from "../components/ui/button.js"
import { formatWhen } from "../i18n/format.js"
import { t } from "../i18n/translate.js"
import QRCode from "qrcode"

type FeatureCardProps = {
  feature: Feature | null
  disabled: boolean
  onRename: (name: string) => void
  onDelete: () => void
}

export function FeatureCard(props: FeatureCardProps) {
  const [name, setName] = useState("")
  useEffect(() => {
    const current = props.feature?.properties.name
    setName(typeof current === "string" ? current : "")
  }, [props.feature])

  return (
    <div className="flex flex-col gap-2">
      {props.feature ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            props.onRename(name.trim())
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            {t("featureName")}
            <input className="h-9 rounded-lg border border-black/10 px-3 text-sm text-[var(--foreground)]" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={props.disabled}>
              {t("saveFeature")}
            </Button>
            <Button size="sm" variant="quiet" disabled={props.disabled} onClick={props.onDelete}>
              {t("deleteFeature")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

type ConflictProps = {
  serverName: string
  localName: string
  onKeep: () => void
  onOverwrite: () => void
  onCopy: () => void
}

export function ConflictCard(props: ConflictProps) {
  return (
    <div className="flex flex-col gap-2" role="status">
      <h2 className="text-sm font-medium">{t("conflictTitle")}</h2>
      <p className="text-sm">{props.serverName}</p>
      <p className="text-sm">{props.localName}</p>
      <Button size="sm" onClick={props.onKeep}>{t("keepServer")}</Button>
      <Button size="sm" variant="quiet" onClick={props.onOverwrite}>{t("overwriteMine")}</Button>
      <Button size="sm" variant="quiet" onClick={props.onCopy}>{t("createCopy")}</Button>
    </div>
  )
}

export function SyncBar(props: { lastSync: string | null; conflicts: number; onSync: () => void; onDevices: () => void; onDisconnect: () => void; onBack: (() => void) | null }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>{props.lastSync ? t("lastSync", { time: formatWhen(props.lastSync) }) : t("notSyncedYet")}</p>
      {props.conflicts > 0 ? <p>{t("conflictCount", { count: props.conflicts })}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={props.onSync}>{t("syncNow")}</Button>
        <Button size="sm" variant="quiet" onClick={props.onDevices}>{t("devices")}</Button>
        {props.onBack ? <Button size="sm" variant="quiet" onClick={props.onBack}>{t("backToProjects")}</Button> : null}
        <Button size="sm" variant="quiet" onClick={props.onDisconnect}>{t("disconnect")}</Button>
      </div>
    </div>
  )
}

export function DevicesCard(props: { qrText: string | null; code: string | null; expiresAt: string | null; devices: { id: string; displayName: string }[]; onAdd: () => void; onRemove: (id: string) => void }) {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    if (!props.qrText) return
    let cancelled = false
    void QRCode.toDataURL(props.qrText, { width: 180, margin: 1 }).then((url) => {
      if (!cancelled) setImage(url)
    })
    return () => {
      cancelled = true
    }
  }, [props.qrText])
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{t("devices")}</h2>
      <Button size="sm" onClick={props.onAdd}>{t("addDevice")}</Button>
      {props.code ? (
        <div>
          <p className="font-mono text-sm">{props.code}</p>
          <p className="text-sm">{t("enrollmentHelp")}</p>
          {props.expiresAt ? <p className="text-sm">{t("enrollmentExpires", { time: formatWhen(props.expiresAt) })}</p> : null}
          {image ? <img alt={t("enrollmentQr")} className="mt-2 h-44 w-44" src={image} /> : null}
        </div>
      ) : null}
      <ul className="space-y-2">
        {props.devices.map((device) => (
          <li key={device.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{device.displayName}</span>
            <Button size="sm" variant="quiet" onClick={() => props.onRemove(device.id)}>{t("removeDevice")}</Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
