import type { CrsProfile } from "@cartography/geo-core"
import { useEffect, useState, type Ref } from "react"
import { t } from "../i18n/translate.js"
import { fromZonePair, toZonePair, type DisplayDatum } from "../map/display-crs.js"
import { readPlace } from "../sync/api.js"
import type { Session } from "./connection.js"
import { CheckIcon, CloseIcon, CopyIcon, IconButton, PencilIcon } from "./icons.js"

const DATA: DisplayDatum[] = ["web", "SK42", "SK95", "GSK2011"]

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement("textarea")
    area.value = text
    document.body.append(area)
    area.select()
    const ok = document.execCommand("copy")
    area.remove()
    return ok
  }
}

function datumLabel(datum: DisplayDatum, zone: number | null): string {
  if (datum === "web") return t("crsWeb")
  const name = datum === "SK42" ? t("crsSk42") : datum === "SK95" ? t("crsSk95") : t("crsGsk")
  return zone == null ? name : t("crsZone", { name, zone })
}

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
  canCopy: boolean
  session: Session
  datum: DisplayDatum
  zone: number | null
  profile: CrsProfile | null
  outside: boolean
  usable: readonly DisplayDatum[]
  onDatum: (datum: DisplayDatum) => void
  onEdit: () => void
  onCancel: () => void
  onSave: (coordinate: [number, number]) => void
}) {
  const [lon, setLon] = useState("")
  const [lat, setLat] = useState("")
  const [place, setPlace] = useState("")
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!props.value) {
      setLon("")
      setLat("")
      return
    }
    if (props.profile) {
      const [easting, northing] = toZonePair(props.value, props.profile)
      setLon(String(easting))
      setLat(String(northing))
      return
    }
    setLon(props.value[0].toFixed(6))
    setLat(props.value[1].toFixed(6))
  }, [props.value, props.editing, props.profile])
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
  const limit = props.profile ? 20_000_000 : 180
  const parsedLon = parseDegree(lon, limit)
  const parsedLat = parseDegree(lat, props.profile ? limit : 90)
  const shown = !props.value ? t("noCoordinate") : props.profile ? toZonePair(props.value, props.profile).join(", ") : `${props.value[0].toFixed(6)}, ${props.value[1].toFixed(6)}`
  return (
    <section ref={props.barRef} className="absolute inset-x-3 bottom-[calc(44px+max(8px,env(safe-area-inset-bottom)))] z-30 flex h-9 items-center gap-1 rounded-full border border-black/10 bg-white px-2 text-xs shadow-lg">
      {props.editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            if (parsedLon == null || parsedLat == null) return
            props.onSave(props.profile ? fromZonePair(parsedLon, parsedLat, props.profile) : [parsedLon, parsedLat])
          }}
        >
          <input aria-label={t(props.profile ? "easting" : "longitude")} className="h-7 min-w-0 flex-1 rounded-md border border-[var(--border)] px-2" value={lon} inputMode="decimal" onChange={(event) => setLon(event.target.value)} />
          <input aria-label={t(props.profile ? "northing" : "latitude")} className="h-7 min-w-0 flex-1 rounded-md border border-[var(--border)] px-2" value={lat} inputMode="decimal" onChange={(event) => setLat(event.target.value)} />
          <IconButton tone="accent" type="submit" aria-label={t("saveFeature")} title={t("saveFeature")} disabled={parsedLon == null || parsedLat == null}>
            <CheckIcon />
          </IconButton>
          <IconButton tone="fill" aria-label={t("cancel")} title={t("cancel")} onClick={props.onCancel}>
            <CloseIcon />
          </IconButton>
        </form>
      ) : (
        <>
          <button type="button" className="h-7 shrink-0 rounded-full bg-black/5 px-2 text-[11px] font-medium" aria-label={t("crsChoose")} onClick={() => setOpen((current) => !current)}>
            {datumLabel(props.datum, props.zone)}
          </button>
          <span className="shrink-0 tabular-nums text-neutral-700">{shown}</span>
          {props.outside ? <span className="min-w-0 flex-1 truncate text-amber-700">{t("outsideCrs")}</span> : place ? <span className="min-w-0 flex-1 truncate text-neutral-500">{place}</span> : <span className="min-w-0 flex-1" />}
          {open ? (
            <ul className="absolute bottom-11 left-2 z-10 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
              {DATA.map((item) => (
                <li key={item}>
                  <button type="button" className="h-8 w-full px-3 text-left text-sm disabled:text-neutral-300" disabled={!props.usable.includes(item)} onClick={() => { props.onDatum(item); setOpen(false) }}>
                    {datumLabel(item, item === props.datum ? props.zone : null)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {props.canCopy ? (
            <IconButton aria-label={t("copyCoordinate")} title={copied ? t("copiedCoordinate") : t("copyCoordinate")} onClick={() => {
              void copyText(shown).then((ok) => {
                if (!ok) return
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1200)
              })
            }}>
              <CopyIcon />
            </IconButton>
          ) : null}
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
