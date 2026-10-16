import { useEffect, useState, type Ref } from "react"
import { t } from "../i18n/translate.js"
import { readPlace } from "../sync/api.js"
import type { Session } from "./connection.js"
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
  session: Session
  onEdit: () => void
  onCancel: () => void
  onSave: (coordinate: [number, number]) => void
}) {
  const [lon, setLon] = useState("")
  const [lat, setLat] = useState("")
  const [place, setPlace] = useState("")
  useEffect(() => {
    setLon(props.value ? props.value[0].toFixed(6) : "")
    setLat(props.value ? props.value[1].toFixed(6) : "")
  }, [props.value, props.editing])
  const longitude = props.value?.[0]
  const latitude = props.value?.[1]
  useEffect(() => {
    if (longitude == null || latitude == null) {
      setPlace("")
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void readPlace(props.session, longitude, latitude, controller.signal)
        .then((label) => {
          if (!controller.signal.aborted) setPlace(label)
        })
        .catch(() => {
          if (!controller.signal.aborted) setPlace("")
        })
    }, 400)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [longitude, latitude, props.session])
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
          <span className="shrink-0 px-1 tabular-nums text-neutral-700">{props.value ? `${props.value[0].toFixed(6)}, ${props.value[1].toFixed(6)}` : t("noCoordinate")}</span>
          {place ? <span className="min-w-0 flex-1 truncate text-neutral-500">{place}</span> : <span className="flex-1" />}
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
