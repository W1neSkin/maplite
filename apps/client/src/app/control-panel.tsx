import { useState } from "react"
import { t } from "../i18n/translate.js"
import { CheckIcon, CloseIcon, IconButton, TrashIcon } from "./icons.js"

export type ControlRow = { id: string; name: string; x: number; y: number }

export function ControlPanel(props: {
  points: readonly ControlRow[]
  rms: string | null
  picking: boolean
  draft: [number, number] | null
  canPlace: boolean
  onPick: () => void
  onSave: (x: number, y: number) => void
  onCancel: () => void
  onDelete: (id: string) => void
  onPlace: () => void
  onClose: () => void
}) {
  const [x, setX] = useState("")
  const [y, setY] = useState("")
  const ready = Number.isFinite(Number(x)) && Number.isFinite(Number(y)) && x.trim() !== "" && y.trim() !== ""
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <IconButton tone="fill" aria-label={t("addControl")} title={t("addControl")} onClick={props.onPick}>
          <span className="text-sm">+</span>
        </IconButton>
        <IconButton tone="accent" aria-label={t("placeLayer")} title={t("placeLayer")} disabled={!props.canPlace} onClick={props.onPlace}>
          <CheckIcon />
        </IconButton>
        <IconButton tone="fill" aria-label={t("close")} title={t("close")} onClick={props.onClose}>
          <CloseIcon />
        </IconButton>
        {props.rms ? <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{props.rms}</span> : null}
      </div>
      {props.picking ? <p className="text-xs text-neutral-500">{t("controlPick")}</p> : null}
      {props.draft ? (
        <form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); if (!ready) return; props.onSave(Number(x), Number(y)); setX(""); setY("") }}>
          <input aria-label={t("localX")} className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 text-sm" value={x} inputMode="decimal" onChange={(event) => setX(event.target.value)} />
          <input aria-label={t("localY")} className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 text-sm" value={y} inputMode="decimal" onChange={(event) => setY(event.target.value)} />
          <IconButton tone="accent" type="submit" aria-label={t("saveFeature")} title={t("saveFeature")} disabled={!ready}><CheckIcon /></IconButton>
          <IconButton tone="fill" aria-label={t("cancel")} title={t("cancel")} onClick={props.onCancel}><CloseIcon /></IconButton>
        </form>
      ) : null}
      <ul>
        {props.points.map((point) => (
          <li key={point.id} className="flex items-center gap-1 text-sm">
            <span className="min-w-0 flex-1 truncate">{point.name} {point.x}, {point.y}</span>
            <IconButton aria-label={t("deleteFeature")} title={t("deleteFeature")} onClick={() => props.onDelete(point.id)}><TrashIcon /></IconButton>
          </li>
        ))}
      </ul>
    </div>
  )
}
