import { t } from "../i18n/translate.js"
import { EyeIcon, EyeOffIcon, IconButton } from "./icons.js"
import type { LivePerson } from "./use-live.js"

/** One dynamic type is one layer. This id is local and is not a project record. */
export const LIVE_DEVICE_LAYER = "live:device"
export const LIVE_COLOR = "#b45309"

export function LiveLayerRow(props: { count: number; hidden: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <li className="flex items-center">
      <IconButton aria-label={props.hidden ? t("showLayer") : t("hideLayer")} title={props.hidden ? t("showLayer") : t("hideLayer")} onClick={props.onToggle}>
        {props.hidden ? <EyeOffIcon /> : <EyeIcon />}
      </IconButton>
      <button type="button" className={props.hidden ? "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm text-neutral-400" : "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm"} onClick={props.onOpen}>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: props.hidden ? undefined : LIVE_COLOR }} />
        <span className="min-w-0 flex-1 truncate">{t("liveTitle")}</span>
        <span className="text-xs tabular-nums text-neutral-500">{props.count}</span>
      </button>
    </li>
  )
}

export function LiveLayerBody(props: { people: readonly LivePerson[]; onToggle: (id: string) => void }) {
  return (
    <ul className="flex flex-col">
      {props.people.map((person) => (
        <li key={person.id} className="flex items-center">
          <IconButton aria-label={person.shown ? t("hideLayer") : t("showLayer")} title={person.shown ? t("hideLayer") : t("showLayer")} onClick={() => props.onToggle(person.id)}>
            {person.shown ? <EyeIcon /> : <EyeOffIcon />}
          </IconButton>
          <span className="min-w-0 flex-1 truncate px-1 text-sm">{person.name}</span>
        </li>
      ))}
    </ul>
  )
}
