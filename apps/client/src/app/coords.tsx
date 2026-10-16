import { useEffect, useState, type Ref } from "react"
import { t } from "../i18n/translate.js"
import { CheckIcon, CloseIcon, IconButton, PencilIcon } from "./icons.js"

function parseDegree(text: string, limit: number): number | null {
  const value = Number(text.trim())
  if (!Number.isFinite(value) || value < -limit || value > limit) return null
  return value
}

export function CoordBar(props: {
  barRef: Ref<HTMLElement>
  value: [number, number] | null
  editing: boolean
  canEdit: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (coordinate: [number, number]) => void
}) {
  const [lon, setLon] = useState("")
  const [lat, setLat] = useState("")
  useEffect(() => {
    setLon(props.value ? props.value[0].toFixed(6) : "")
    setLat(props.value ? props.value[1].toFixed(6) : "")
  }, [props.value, props.editing])
  const parsedLon = parseDegree(lon, 180)
  const parsedLat = parseDegree(lat, 90)
  return (
    <section ref={props.barRef} className="absolute inset-x-3 bottom-[calc(44px+max(8px,env(safe-area-inset-bottom)))] z-30 flex h-9 items-center gap-1 rounded-full border border-black/10 bg-white px-2 text-xs shadow-lg">
      {props.editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            if (parsedLon == null || parsedLat == null) return
            props.onSave([parsedLon, parsedLat])
          }}
        >
          <input aria-label={t("longitude")} className="h-7 min-w-0 flex-1 rounded-md border border-[var(--border)] px-2" value={lon} inputMode="decimal" onChange={(event) => setLon(event.target.value)} />
          <input aria-label={t("latitude")} className="h-7 min-w-0 flex-1 rounded-md border border-[var(--border)] px-2" value={lat} inputMode="decimal" onChange={(event) => setLat(event.target.value)} />
          <IconButton tone="accent" type="submit" aria-label={t("saveFeature")} title={t("saveFeature")} disabled={parsedLon == null || parsedLat == null}>
            <CheckIcon />
          </IconButton>
          <IconButton tone="fill" aria-label={t("cancel")} title={t("cancel")} onClick={props.onCancel}>
            <CloseIcon />
          </IconButton>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate px-1 tabular-nums text-neutral-700">{props.value ? `${props.value[0].toFixed(6)}, ${props.value[1].toFixed(6)}` : t("noCoordinate")}</span>
          {props.canEdit ? (
            <IconButton aria-label={t("editCoordinate")} title={t("editCoordinate")} onClick={props.onEdit}>
              <PencilIcon />
            </IconButton>
          ) : null}
        </>
      )}
    </section>
  )
}
