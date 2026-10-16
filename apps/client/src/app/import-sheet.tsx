import { useState } from "react"
import { t } from "../i18n/translate.js"
import type { CrsChoice, ImportDecide, ImportOutcome, LoadOptions } from "../import/load.js"
import { Button } from "../components/ui/button.js"

const blockedKey = {
  missing: "importMissing",
  unknown: "importUnknown",
  height: "importHeight",
  encoding: "importEncoding",
  "too-big": "importTooBig",
  empty: "importEmpty",
  mixed: "importMixed",
  format: "importFormat",
} as const

const MODES = ["wgs84", "SK42", "SK95", "GSK2011"] as const

function modeLabel(mode: (typeof MODES)[number]): string {
  if (mode === "wgs84") return t("importUseDegrees")
  if (mode === "SK42") return t("crsSk42")
  if (mode === "SK95") return t("crsSk95")
  return t("crsGsk")
}

export function ImportBody(props: {
  outcome: ImportOutcome
  onChoose: (name: string) => void
  onDecide: (options: Pick<LoadOptions, "choice" | "allowHeight" | "encoding">) => void
  onConfirm: () => void
}) {
  if (props.outcome.kind === "choose") {
    return (
      <div>
        <p className="mb-1 text-xs text-neutral-500">{t("importChoose")}</p>
        <ul>
          {props.outcome.names.map((name) => (
            <li key={name}>
              <button type="button" className="h-8 w-full truncate text-left text-sm" onClick={() => props.onChoose(name)}>
                {name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (props.outcome.kind === "decide") return <DecideForm item={props.outcome} onDecide={props.onDecide} />
  if (props.outcome.kind === "blocked") {
    return <p className="text-sm">{t(blockedKey[props.outcome.code], props.outcome.count ? { count: props.outcome.count } : undefined)}</p>
  }
  const ready = props.outcome
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{ready.name}</p>
      <p className="text-xs text-neutral-500">{t("importCount", { count: ready.count })}</p>
      <p className="text-xs text-neutral-500">{ready.operationName ? t("importOperation", { name: ready.operationName, meters: ready.accuracyM ?? 0 }) : t("importWgs84")}</p>
      {ready.outside ? <p className="text-xs text-amber-700">{t("importOutside")}</p> : null}
      <Button size="sm" onClick={props.onConfirm}>{t("importConfirm")}</Button>
    </div>
  )
}

function DecideForm(props: { item: ImportDecide; onDecide: (options: Pick<LoadOptions, "choice" | "allowHeight" | "encoding">) => void }) {
  const [mode, setMode] = useState<(typeof MODES)[number]>("wgs84")
  const [zone, setZone] = useState("7")
  const [encoding, setEncoding] = useState("utf-8")
  const zoneNumber = Number(zone)
  const zoneOk = Number.isInteger(zoneNumber) && zoneNumber >= 1 && zoneNumber <= 32
  const choice: CrsChoice = mode === "wgs84" ? { kind: "wgs84" } : { kind: "zone", datum: mode, zone: zoneNumber }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{props.item.name}</p>
      <p className="text-xs text-neutral-500">{t("importCount", { count: props.item.count })}</p>
      {props.item.needsHeight ? <p className="text-xs text-amber-700">{t("importNeedHeight")}</p> : null}
      {props.item.needsCrs ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-neutral-500">{t("importNeedCrs")}</p>
          <div className="flex flex-wrap gap-1">
            {MODES.map((item) => (
              <button key={item} type="button" className={mode === item ? "h-8 rounded-full bg-[var(--primary)] px-2 text-xs text-white" : "h-8 rounded-full bg-black/5 px-2 text-xs"} onClick={() => setMode(item)}>
                {modeLabel(item)}
              </button>
            ))}
          </div>
          {mode !== "wgs84" ? (
            <input aria-label={t("importZoneNumber")} className="h-8 w-20 rounded-md border border-[var(--border)] px-2 text-sm" inputMode="numeric" value={zone} onChange={(event) => setZone(event.target.value)} />
          ) : null}
        </div>
      ) : null}
      {props.item.needsEncoding ? (
        <div className="flex gap-1">
          <button type="button" className={encoding === "utf-8" ? "h-8 rounded-full bg-[var(--primary)] px-2 text-xs text-white" : "h-8 rounded-full bg-black/5 px-2 text-xs"} onClick={() => setEncoding("utf-8")}>{t("importEncodingUtf8")}</button>
          <button type="button" className={encoding === "windows-1251" ? "h-8 rounded-full bg-[var(--primary)] px-2 text-xs text-white" : "h-8 rounded-full bg-black/5 px-2 text-xs"} onClick={() => setEncoding("windows-1251")}>{t("importEncoding1251")}</button>
        </div>
      ) : null}
      <Button size="sm" disabled={props.item.needsCrs && mode !== "wgs84" && !zoneOk} onClick={() => props.onDecide({
        choice: props.item.needsCrs ? choice : undefined,
        allowHeight: props.item.needsHeight ? true : undefined,
        encoding: props.item.needsEncoding ? encoding : undefined,
      })}>{t("importContinue")}</Button>
    </div>
  )
}
