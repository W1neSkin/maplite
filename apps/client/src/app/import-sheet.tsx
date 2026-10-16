import { t } from "../i18n/translate.js"
import type { ImportOutcome } from "../import/load.js"
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

export function ImportBody(props: { outcome: ImportOutcome; onChoose: (name: string) => void; onConfirm: () => void }) {
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
