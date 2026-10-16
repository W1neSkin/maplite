import { useState } from "react"
import { t } from "../i18n/translate.js"
import { IconButton } from "./icons.js"
import type { MapLayer } from "./model.js"

export function Legend(props: { layers: readonly MapLayer[]; hidden: ReadonlySet<string> }) {
  const [open, setOpen] = useState(false)
  const shown = props.layers.filter((layer) => !props.hidden.has(layer.id))
  return (
    <div className="absolute right-[max(8px,env(safe-area-inset-right))] top-[calc(max(8px,env(safe-area-inset-top))+116px)] z-20 flex flex-col items-end gap-1">
      <IconButton tone="dock" aria-label={t("legend")} aria-pressed={open} title={t("legend")} onClick={() => setOpen((current) => !current)}>
        <span className="h-3 w-3 rounded-sm bg-neutral-800" />
      </IconButton>
      {open ? (
        <ul className="max-h-48 w-40 overflow-auto rounded-xl border border-black/10 bg-white/95 p-2 shadow">
          {shown.map((layer) => (
            <li key={layer.id} className="flex h-6 items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
              <span className="min-w-0 flex-1 truncate">{layer.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
