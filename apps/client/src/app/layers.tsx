import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { t } from "../i18n/translate.js"
import { measureLabel } from "./measure-label.js"
import type { MapFeature, MapLayer } from "./model.js"
import { CheckIcon, CloseIcon, ControlIcon, ExportIcon, EyeIcon, EyeOffIcon, GeometryGlyph, GripIcon, GroupIcon, IconButton, ImportIcon, LayerIcon, PencilIcon, PinIcon, SendIcon, StepIcon, TrashIcon } from "./icons.js"
import type { MapGroup } from "./model.js"
import { FieldTools } from "./field-tools.js"
import { LIVE_DEVICE_LAYER, LiveLayerBody, LiveLayerRow } from "./live-layer.js"
import type { LivePerson } from "./use-live.js"

type LayerBrowserProps = {
  layers: readonly MapLayer[]
  groups: readonly MapGroup[]
  features: readonly MapFeature[]
  openLayerId: string | null
  selectedId: string | null
  onOpenLayer: (id: string) => void
  onSelectFeature: (id: string) => void
  onRenameFeature: (id: string, name: string) => void
  onDeleteFeature: (id: string) => void
  onCreateLayer: (name: string, geometryType: MapLayer["geometryType"], groupId: string | null) => void
  onCreateGroup: (name: string) => void
  onSetGroup: (layerId: string, groupId: string | null) => void
  hidden: ReadonlySet<string>
  onToggleVisible: (id: string) => void
  onReorder: (groupId: string | null, from: number, to: number) => void
  onImport: () => void
  onControls: () => void
  locked: boolean
  fieldBusy: boolean
  fieldNote: string | null
  onMoveFeature: (id: string, direction: -1 | 1) => void
  onMark: () => void
  onAverage: () => void
  onBuildLine: () => void
  onBuildPolygon: () => void
  livePeople: readonly LivePerson[]
  onTogglePerson: (id: string) => void
}

function buckets(layers: readonly MapLayer[], groups: readonly MapGroup[]) {
  const sections = groups.map((group) => ({ id: group.id as string | null, name: group.name, layers: layers.filter((layer) => layer.groupId === group.id) }))
  sections.push({ id: null, name: t("noGroup"), layers: layers.filter((layer) => !layer.groupId || !groups.some((group) => group.id === layer.groupId)) })
  return sections
}

export function LayerBrowser(props: LayerBrowserProps) {
  const [query, setQuery] = useState("")
  const layer = props.layers.find((item) => item.id === props.openLayerId) ?? null
  if (props.openLayerId === LIVE_DEVICE_LAYER) {
    return <LiveLayerBody people={props.livePeople} onToggle={props.onTogglePerson} />
  }
  if (!layer) {
    return (
      <div className="flex flex-col gap-1">
        {props.livePeople.length > 0 ? (
          <ul className="flex flex-col">
            <LiveLayerRow count={props.livePeople.length} hidden={props.hidden.has(LIVE_DEVICE_LAYER)} onToggle={() => props.onToggleVisible(LIVE_DEVICE_LAYER)} onOpen={() => props.onOpenLayer(LIVE_DEVICE_LAYER)} />
          </ul>
        ) : null}
        {buckets(props.layers, props.groups).map((section) => (
          <div key={section.id ?? "none"}>
            <div className="px-1 text-[11px] uppercase tracking-wide text-neutral-400">{section.name}</div>
            <ul className="flex flex-col">
              {section.layers.map((item, index) => {
                const hidden = props.hidden.has(item.id)
                return (
                  <li key={item.id} data-layer-index={index} data-group-id={section.id ?? ""} className="flex items-center">
                    <IconButton aria-label={hidden ? t("showLayer") : t("hideLayer")} title={hidden ? t("showLayer") : t("hideLayer")} onClick={() => props.onToggleVisible(item.id)}>
                      {hidden ? <EyeOffIcon /> : <EyeIcon />}
                    </IconButton>
                    <button type="button" className={hidden ? "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm text-neutral-400" : "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm"} onClick={() => props.onOpenLayer(item.id)}>
                      <GeometryGlyph type={item.geometryType} color={hidden ? undefined : item.color} />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="text-xs tabular-nums text-neutral-500">{item.count}</span>
                    </button>
                    <IconButton aria-label={t("newGroup")} title={item.groupId ? props.groups.find((group) => group.id === item.groupId)?.name : t("noGroup")} onClick={() => {
                      const ids = [null, ...props.groups.map((group) => group.id)]
                      const at = ids.indexOf(item.groupId)
                      props.onSetGroup(item.id, ids[(at + 1) % ids.length] ?? null)
                    }}>
                      <GripIcon />
                    </IconButton>
                    <IconButton
                      aria-label={t("moveLayer")}
                      title={t("moveLayer")}
                      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                      onPointerUp={(event) => {
                        const row = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-layer-index]")
                        const same = row?.getAttribute("data-group-id") === (section.id ?? "")
                        const to = row && same ? Number(row.getAttribute("data-layer-index")) : index
                        if (Number.isInteger(to)) props.onReorder(section.id, index, to)
                      }}
                    >
                      <GripIcon />
                    </IconButton>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        <div className="flex gap-1">
          <IconButton tone="fill" aria-label={t("importData")} title={t("importData")} onClick={props.onImport}>
            <ImportIcon />
          </IconButton>
          <IconButton tone="fill" aria-label={t("controlPoints")} title={t("controlPoints")} onClick={props.onControls}>
            <ControlIcon />
          </IconButton>
          <NewGroup onCreate={props.onCreateGroup} />
          <NewLayer groups={props.groups} onCreate={props.onCreateLayer} />
        </div>
      </div>
    )
  }
  const ranked = props.features.filter((feature) => feature.layerId === layer.id)
  const needle = query.trim().toLowerCase()
  const features = ranked.filter((feature) => {
    if (!needle) return true
    const hay = [feature.name, ...Object.entries(feature.properties).filter(([key]) => key !== "walk").flat()].join(" ").toLowerCase()
    return hay.includes(needle)
  })
  const canMove = layer.geometryType === "Point" && !props.locked
  return (
    <div className="flex flex-col gap-1">
      <input aria-label={t("searchFeatures")} className="h-8 rounded-lg border border-[var(--border)] px-2 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} />
      {canMove ? <FieldTools busy={props.fieldBusy} note={props.fieldNote} onMark={props.onMark} onAverage={props.onAverage} onLine={props.onBuildLine} onPolygon={props.onBuildPolygon} /> : null}
    <ul className="flex flex-col">
      {features.map((feature) => {
        const index = ranked.findIndex((item) => item.id === feature.id)
        return (
        <FeatureRow
          key={feature.id}
          feature={feature}
          selected={feature.id === props.selectedId}
          onSelect={() => props.onSelectFeature(feature.id)}
          locked={props.locked}
          onRename={(name) => props.onRenameFeature(feature.id, name)}
          onDelete={() => props.onDeleteFeature(feature.id)}
          move={canMove ? (direction) => props.onMoveFeature(feature.id, direction) : null}
          atStart={index <= 0}
          atEnd={index < 0 || index === ranked.length - 1}
        />
        )
      })}
    </ul>
    </div>
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

/** Name is already the row title. Accuracy fields use words, not the stored key. */
function shownProperty(key: string, value: unknown): { label: string; text: string } | null {
  if (key === "name" || key === "walk") return null
  if ((key === "accuracyM" || key === "scatterM") && typeof value === "number") {
    return { label: key === "accuracyM" ? t("reportedAccuracy") : t("scatter"), text: t("accuracyMeters", { meters: Math.round(value) }) }
  }
  if (key === "fixes") return { label: t("fixes"), text: String(value) }
  return { label: key, text: String(value) }
}

function FeatureRow(props: { feature: MapFeature; selected: boolean; locked: boolean; onSelect: () => void; onRename: (name: string) => void; onDelete: () => void; move: ((direction: -1 | 1) => void) | null; atStart: boolean; atEnd: boolean }) {
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
  if (props.selected && editing && !props.locked) {
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
  const size = props.selected ? measureLabel(props.feature.geometry) : null
  return (
    <li ref={rowRef} className={props.selected ? "rounded-lg bg-[var(--primary)]/10" : ""}>
      <div className="flex items-center">
        <button type="button" className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm" onClick={props.onSelect}>
          <GeometryGlyph type={props.feature.geometry.type} color={props.feature.color} />
          <span className="truncate">{props.feature.name}</span>
        </button>
        {props.selected && !props.locked ? (
          <>
            {props.move ? (
              <>
                <IconButton aria-label={t("moveUp")} title={t("moveUp")} disabled={props.atStart} onClick={() => props.move?.(-1)}><StepIcon direction="up" /></IconButton>
                <IconButton aria-label={t("moveDown")} title={t("moveDown")} disabled={props.atEnd} onClick={() => props.move?.(1)}><StepIcon direction="down" /></IconButton>
              </>
            ) : null}
            <IconButton aria-label={t("rename")} title={t("rename")} onClick={() => setEditing(true)}>
              <PencilIcon />
            </IconButton>
            <IconButton aria-label={t("deleteFeature")} title={t("deleteFeature")} onClick={props.onDelete}>
              <TrashIcon />
            </IconButton>
          </>
        ) : null}
      </div>
      {size ? <p className="px-7 pb-1 text-xs text-neutral-500">{size}</p> : null}
      {props.selected ? (
        <dl className="px-7 pb-1 text-xs text-neutral-500">
          {Object.entries(props.feature.properties).map(([key, value]) => {
            const shown = shownProperty(key, value)
            if (!shown) return null
            return <div key={key} className="flex gap-2"><dt className="shrink-0">{shown.label}</dt><dd className="min-w-0 truncate">{shown.text}</dd></div>
          })}
        </dl>
      ) : null}
    </li>
  )
}

function NewGroup(props: { onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  if (!open) return <IconButton tone="fill" aria-label={t("newGroup")} title={t("newGroup")} onClick={() => setOpen(true)}><GroupIcon /></IconButton>
  return (
    <form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); const next = name.trim(); if (!next) return; props.onCreate(next); setName(""); setOpen(false) }}>
      <input aria-label={t("groupName")} className="h-8 w-24 rounded-lg border border-[var(--border)] px-2 text-sm" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
      <IconButton tone="accent" type="submit" aria-label={t("createLayer")} title={t("createLayer")} disabled={!name.trim()}><CheckIcon /></IconButton>
    </form>
  )
}

function NewLayer(props: { groups: readonly MapGroup[]; onCreate: (name: string, geometryType: MapLayer["geometryType"], groupId: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [geometryType, setGeometryType] = useState<MapLayer["geometryType"]>("Point")
  const [groupId, setGroupId] = useState<string | null>(null)
  if (!open) {
    return (
      <IconButton tone="fill" aria-label={t("newLayer")} title={t("newLayer")} onClick={() => setOpen(true)}>
        <LayerIcon />
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
        props.onCreate(next, geometryType, groupId)
        setName("")
        setGeometryType("Point")
        setGroupId(null)
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
      <div className="flex flex-wrap gap-1">
        <button type="button" aria-label={t("noGroup")} className={groupId == null ? "h-7 rounded-full bg-neutral-900 px-2 text-xs text-white" : "h-7 rounded-full bg-white px-2 text-xs"} onClick={() => setGroupId(null)}>{t("noGroup")}</button>
        {props.groups.map((group) => (
          <button key={group.id} type="button" className={groupId === group.id ? "h-7 rounded-full bg-neutral-900 px-2 text-xs text-white" : "h-7 rounded-full bg-white px-2 text-xs"} onClick={() => setGroupId(group.id)}>{group.name}</button>
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

export function LayerActions(props: { geometryType: MapLayer["geometryType"]; color: string; styleOpen: boolean; locked: boolean; onStyle: () => void; onAdd: () => void; onSend?: () => void; onExport: () => void; onDelete: () => void }) {
  return (
    <>
      {props.locked ? null : (
        <IconButton tone="fill" aria-label={t(props.geometryType === "Point" ? "addToLayer" : props.geometryType === "LineString" ? "drawLine" : "drawPolygon")} title={t(props.geometryType === "Point" ? "addToLayer" : props.geometryType === "LineString" ? "drawLine" : "drawPolygon")} onClick={props.onAdd}>
          {props.geometryType === "Point" ? <PinIcon /> : <GeometryGlyph type={props.geometryType} />}
        </IconButton>
      )}
      {props.locked ? null : (
        <IconButton tone="fill" aria-label={t("layerColor")} aria-pressed={props.styleOpen} title={t("layerColor")} onClick={props.onStyle}>
          <span className={props.styleOpen ? "h-4 w-4 rounded-full ring-2 ring-neutral-900" : "h-4 w-4 rounded-full"} style={{ backgroundColor: props.color }} />
        </IconButton>
      )}
      {props.onSend ? (
        <IconButton tone="fill" aria-label={t("sendLayer")} title={t("sendLayer")} onClick={props.onSend}>
          <SendIcon />
        </IconButton>
      ) : null}
      <IconButton tone="fill" aria-label={t("exportLayer")} title={t("exportLayer")} onClick={props.onExport}>
        <ExportIcon />
      </IconButton>
      {props.locked ? null : (
        <IconButton tone="fill" aria-label={t("deleteLayer")} title={t("deleteLayer")} onClick={props.onDelete}>
          <TrashIcon />
        </IconButton>
      )}
    </>
  )
}
