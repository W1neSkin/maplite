import { useState, type Ref } from "react"
import { formatWhen } from "../i18n/format.js"
import { t } from "../i18n/translate.js"
import { BackIcon, CheckIcon, CloseIcon, DisconnectIcon, FitIcon, IconButton, LayersIcon, LocateIcon, PinIcon, SyncIcon, UndoIcon } from "./icons.js"

export function MapDock(props: {
  dockRef: Ref<HTMLElement>
  layersOpen: boolean
  placing: boolean
  disabled: boolean
  locating: boolean
  onLayers: () => void
  onAdd: () => void
  onLocate: () => void
}) {
  return (
    <nav ref={props.dockRef} className="absolute bottom-[max(8px,env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 gap-2">
      <IconButton tone={props.layersOpen ? "dockOn" : "dock"} aria-pressed={props.layersOpen} aria-label={t("layersTitle")} title={t("layersTitle")} onClick={props.onLayers}>
        <LayersIcon />
      </IconButton>
      <IconButton tone={props.placing ? "dockOn" : "dock"} aria-pressed={props.placing} aria-label={t("addPoint")} title={t("addPoint")} disabled={props.disabled} onClick={props.onAdd}>
        <PinIcon />
      </IconButton>
      <IconButton tone={props.locating ? "dockOn" : "dock"} aria-pressed={props.locating} aria-label={t("myLocation")} title={t("myLocation")} onClick={props.onLocate}>
        <LocateIcon />
      </IconButton>
    </nav>
  )
}

export function PlacingBar(props: {
  name: string
  onName: (name: string) => void
  layerId: string
  layers: readonly { id: string; name: string }[]
  onLayer: (id: string) => void
  onClose: () => void
  sketch?: boolean
  canFinish?: boolean
  onUndo?: () => void
  onFinish?: () => void
}) {
  const layer = props.layers.find((item) => item.id === props.layerId)
  const [open, setOpen] = useState(false)
  return (
    <div role="status" aria-label={t("tapToPlace", { layer: layer?.name ?? "" })} className="absolute left-3 right-14 top-[max(8px,env(safe-area-inset-top))] z-20 overflow-hidden rounded-2xl bg-neutral-900 text-white shadow-lg">
      <div className="flex items-center">
        <input
          aria-label={t("featureName")}
          className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
          value={props.name}
          onChange={(event) => props.onName(event.target.value)}
        />
        {props.sketch ? (
          <IconButton tone="inverse" aria-label={t("undoVertex")} title={t("undoVertex")} onClick={props.onUndo}>
            <UndoIcon />
          </IconButton>
        ) : null}
        {props.sketch ? (
          <IconButton tone="accent" aria-label={t("finishShape")} title={t("finishShape")} disabled={!props.canFinish} onClick={props.onFinish}>
            <CheckIcon />
          </IconButton>
        ) : null}
        <IconButton tone="inverse" aria-label={t("close")} title={t("close")} onClick={props.onClose}>
          <CloseIcon />
        </IconButton>
      </div>
      <button type="button" className="flex h-8 w-full items-center px-3 text-left text-xs text-white/80" aria-label={t("chooseLayer")} onClick={() => setOpen((current) => !current)}>
        <span className="truncate">{layer?.name}</span>
      </button>
      {open ? (
        <ul className="max-h-32 overflow-auto border-t border-white/10">
          {props.layers.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === props.layerId ? "h-8 w-full truncate px-3 text-left text-sm text-white" : "h-8 w-full truncate px-3 text-left text-sm text-white/70"}
                onClick={() => {
                  props.onLayer(item.id)
                  setOpen(false)
                }}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function SyncActions(props: { lastSync: string | null; onSync: () => void; onFit: () => void; fitLabel: string; onBack: (() => void) | null; onDisconnect: () => void }) {
  const synced = props.lastSync ? t("lastSync", { time: formatWhen(props.lastSync) }) : t("syncNow")
  return (
    <>
      <IconButton tone="fill" aria-label={props.fitLabel} title={props.fitLabel} onClick={props.onFit}>
        <FitIcon />
      </IconButton>
      <IconButton tone="fill" aria-label={t("syncNow")} title={synced} onClick={props.onSync}>
        <SyncIcon />
      </IconButton>
      {props.onBack ? (
        <IconButton tone="fill" aria-label={t("backToProjects")} title={t("backToProjects")} onClick={props.onBack}>
          <BackIcon />
        </IconButton>
      ) : null}
      <IconButton tone="fill" aria-label={t("disconnect")} title={t("disconnect")} onClick={props.onDisconnect}>
        <DisconnectIcon />
      </IconButton>
    </>
  )
}
