import { t } from "../i18n/translate.js"
import type { MapLayer } from "./model.js"
import type { ScreenNotice } from "./screen.js"

type PanelProps = {
  layers: readonly MapLayer[]
  notice: ScreenNotice
  basemapFailed: boolean
  onFit: () => void
  onRetry: () => void
}

export function Panel(props: PanelProps) {
  return (
    <div>
      {props.notice === "loading" ? <p className="py-1 text-sm" role="status">{t("loadingMap")}</p> : null}
      {props.notice === "server" ? (
        <button type="button" className="py-1 text-sm" role="status" onClick={props.onRetry}>
          {t("serverUnavailable")}
        </button>
      ) : null}
      {props.notice === "empty" ? <p className="py-1 text-sm" role="status">{t("emptyProject")}</p> : null}
      {props.basemapFailed ? <p className="py-1 text-sm" role="status">{t("basemapUnavailable")}</p> : null}
      {props.notice === "ready" ? (
        <ul>
          {props.layers.map((layer) => (
            <li key={layer.id}>
              <button type="button" className="flex w-full items-center justify-between py-2 text-left text-sm" onClick={props.onFit}>
                <span>{layer.name}</span>
                <span className="text-xs tabular-nums text-neutral-500">{layer.count}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
