import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { t } from "../i18n/translate.js"
import type { MapFeature, MapLayer } from "./model.js"
import { CheckIcon, CloseIcon, ExportIcon, EyeIcon, EyeOffIcon, GeometryGlyph, GripIcon, IconButton, ImportIcon, PencilIcon, PinIcon, PlusIcon, TrashIcon } from "./icons.js"

type LayerBrowserProps = {
  layers: readonly MapLayer[]
  features: readonly MapFeature[]
  openLayerId: string | null
  selectedId: string | null
  onOpenLayer: (id: string) => void
  onSelectFeature: (id: string) => void
  onRenameFeature: (id: string, name: string) => void
  onDeleteFeature: (id: string) => void
  onCreateLayer: (name: string, geometryType: MapLayer["geometryType"]) => void
  hidden: ReadonlySet<string>
  onToggleVisible: (id: string) => void
  onReorder: (from: number, to: number) => void
  onImport: () => void
}

export function LayerBrowser(props: LayerBrowserProps) {
  const layer = props.layers.find((item) => item.id === props.openLayerId) ?? null
  if (!layer) {
    return (
      <div className="flex flex-col gap-1">
        <ul className="flex flex-col">
          {props.layers.map((item, index) => {
            const hidden = props.hidden.has(item.id)
            return (
              <li key={item.id} data-layer-index={index} className="flex items-center">
                <IconButton aria-label={hidden ? t("showLayer") : t("hideLayer")} title={hidden ? t("showLayer") : t("hideLayer")} onClick={() => props.onToggleVisible(item.id)}>
                  {hidden ? <EyeOffIcon /> : <EyeIcon />}
                </IconButton>
                <button type="button" className={hidden ? "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm text-neutral-400" : "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm"} onClick={() => props.onOpenLayer(item.id)}>
                  <GeometryGlyph type={item.geometryType} color={hidden ? undefined : item.color} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="text-xs tabular-nums text-neutral-500">{item.count}</span>
                </button>
                <IconButton
                  aria-label={t("moveLayer")}
                  title={t("moveLayer")}
                  onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                  onPointerUp={(event) => {
                    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-layer-index]")
                    const to = row ? Number(row.getAttribute("data-layer-index")) : index
                    if (Number.isInteger(to)) props.onReorder(index, to)
                  }}
                >
                  <GripIcon />
                </IconButton>
              </li>
            )
          })}
        </ul>
        <div className="flex gap-1">
          <IconButton tone="fill" aria-label={t("importData")} title={t("importData")} onClick={props.onImport}>
            <ImportIcon />
          </IconButton>
          <NewLayer onCreate={props.onCreateLayer} />
        </div>
      </div>
    )
  }
  const features = props.features.filter((feature) => feature.layerId === layer.id)
  return (
    <ul className="flex flex-col">
      {features.map((feature) => (
        <FeatureRow
          key={feature.id}
          feature={feature}
          selected={feature.id === props.selectedId}
          onSelect={() => props.onSelectFeature(feature.id)}
          onRename={(name) => props.onRenameFeature(feature.id, name)}
          onDelete={() => props.onDeleteFeature(feature.id)}
        />
      ))}
    </ul>
  )
}

/** Keep the selected row inside the sheet. A new point is appended, so the list would otherwise stay scrolled to the top. */
function revealInSheet(row: HTMLElement) {
  const scroller = row.closest("[data-sheet-body]")
  if (!(scroller instanceof HTMLElement)) return
  const rowBox = row.getBoundingClientRect()
  const box = scroller.getBoundingClientRect()
  const pad = 4
  const above = box.top + pad - rowBox.top
  const below = rowBox.bottom - (box.bottom - pad)
  if (above > 0) scroller.scrollTop -= above
  else if (below > 0) scroller.scrollTop += below
}

function FeatureRow(props: { feature: MapFeature; selected: boolean; onSelect: () => void; onRename: (name: string) => void; onDelete: () => void }) {
  const rowRef = useRef<HTMLLIElement>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(props.feature.name)
  useEffect(() => setName(props.feature.name), [props.feature.name])
  useEffect(() => {
    if (!props.selected) setEditing(false)
  }, [props.selected])
  useLayoutEffect(() => {
    const row = rowRef.current
    if (props.selected && row) revealInSheet(row)
  }, [props.selected, editing])
  if (props.selected && editing) {
    return (
      <li ref={rowRef}>
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            const next = name.trim()
            if (next && next !== props.feature.name) props.onRename(next)
            setEditing(false)
          }}
        >
          <GeometryGlyph type={props.feature.geometry.type} color={props.feature.color} />
          <input
            aria-label={t("featureName")}
            className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-2 text-sm"
            value={name}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setName(props.feature.name)
                setEditing(false)
              }
            }}
          />
          <IconButton tone="accent" type="submit" aria-label={t("saveFeature")} title={t("saveFeature")} disabled={!name.trim()}>
            <CheckIcon />
          </IconButton>
          <IconButton tone="fill" aria-label={t("cancel")} title={t("cancel")} onClick={() => { setName(props.feature.name); setEditing(false) }}>
            <CloseIcon />
          </IconButton>
        </form>
      </li>
    )
  }
  return (
    <li ref={rowRef} className={props.selected ? "flex items-center rounded-lg bg-[var(--primary)]/10" : "flex items-center"}>
      <button type="button" className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm" onClick={props.onSelect}>
        <GeometryGlyph type={props.feature.geometry.type} color={props.feature.color} />
        <span className="truncate">{props.feature.name}</span>
      </button>
      {props.selected ? (
        <>
          <IconButton aria-label={t("rename")} title={t("rename")} onClick={() => setEditing(true)}>
            <PencilIcon />
          </IconButton>
          <IconButton aria-label={t("deleteFeature")} title={t("deleteFeature")} onClick={props.onDelete}>
            <TrashIcon />
          </IconButton>
        </>
      ) : null}
    </li>
  )
}

function NewLayer(props: { onCreate: (name: string, geometryType: MapLayer["geometryType"]) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [geometryType, setGeometryType] = useState<MapLayer["geometryType"]>("Point")
  if (!open) {
    return (
      <IconButton tone="fill" aria-label={t("newLayer")} title={t("newLayer")} onClick={() => setOpen(true)}>
        <PlusIcon />
      </IconButton>
    )
  }
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        const next = name.trim()
        if (!next) return
        props.onCreate(next, geometryType)
        setName("")
        setGeometryType("Point")
        setOpen(false)
      }}
    >
      <div className="flex gap-1">
        {(["Point", "LineString", "Polygon"] as const).map((item) => (
          <button key={item} type="button" aria-label={t(item === "Point" ? "pointLayer" : item === "LineString" ? "lineLayer" : "polygonLayer")} className={geometryType === item ? "grid h-8 w-8 place-items-center rounded-full bg-blue-50" : "grid h-8 w-8 place-items-center rounded-full"} onClick={() => setGeometryType(item)}>
            <GeometryGlyph type={item} />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
      <input aria-label={t("newLayer")} className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-2 text-sm" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
      <IconButton tone="accent" type="submit" aria-label={t("createLayer")} title={t("createLayer")} disabled={!name.trim()}>
        <CheckIcon />
      </IconButton>
      <IconButton tone="fill" aria-label={t("cancel")} title={t("cancel")} onClick={() => { setName(""); setOpen(false) }}>
        <CloseIcon />
      </IconButton>
      </div>
    </form>
  )
}

export function LayerActions(props: { geometryType: MapLayer["geometryType"]; color: string; styleOpen: boolean; onStyle: () => void; onAdd: () => void; onExport: () => void; onDelete: () => void }) {
  return (
    <>
      <IconButton tone="fill" aria-label={t(props.geometryType === "Point" ? "addToLayer" : props.geometryType === "LineString" ? "drawLine" : "drawPolygon")} title={t(props.geometryType === "Point" ? "addToLayer" : props.geometryType === "LineString" ? "drawLine" : "drawPolygon")} onClick={props.onAdd}>
        {props.geometryType === "Point" ? <PinIcon /> : <GeometryGlyph type={props.geometryType} />}
      </IconButton>
      <button type="button" aria-label={t("layerColor")} aria-pressed={props.styleOpen} title={t("layerColor")} className={props.styleOpen ? "h-8 w-8 shrink-0 rounded-full ring-2 ring-neutral-900 ring-offset-1" : "h-8 w-8 shrink-0 rounded-full"} style={{ backgroundColor: props.color }} onClick={props.onStyle} />
      <IconButton tone="fill" aria-label={t("exportLayer")} title={t("exportLayer")} onClick={props.onExport}>
        <ExportIcon />
      </IconButton>
      <IconButton tone="fill" aria-label={t("deleteLayer")} title={t("deleteLayer")} onClick={props.onDelete}>
        <TrashIcon />
      </IconButton>
    </>
  )
}
