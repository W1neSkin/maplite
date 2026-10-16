import { useEffect, useState } from "react"
import { t } from "../i18n/translate.js"
import type { MapLayer } from "./model.js"

/** Shared palette. A layer keeps one of these, so the map stays readable. */
export const LAYER_COLORS = [
  { hex: "#2563eb", label: "colorBlue" },
  { hex: "#1d4e89", label: "colorNavy" },
  { hex: "#1f4d3a", label: "colorGreen" },
  { hex: "#8a4b08", label: "colorBrown" },
  { hex: "#dc2626", label: "colorRed" },
  { hex: "#ea580c", label: "colorOrange" },
  { hex: "#7c3aed", label: "colorViolet" },
  { hex: "#0f766e", label: "colorTeal" },
] as const

type LayerStyleProps = {
  color: string
  fillOpacity: number
  geometryType: MapLayer["geometryType"]
  labelAttribute: string | null
  fields: readonly string[]
  onColor: (color: string) => void
  onOpacity: (fillOpacity: number) => void
  onLabel: (field: string | null) => void
}

export function labelFields(records: readonly { properties: Record<string, unknown> }[]): string[] {
  const names = new Set<string>()
  for (const record of records) {
    for (const [key, value] of Object.entries(record.properties)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") names.add(key)
    }
  }
  return [...names]
}

/** The palette stays closed. Color is set rarely, so it must not sit on the layer title. */
export function LayerStyle(props: LayerStyleProps) {
  const [opacity, setOpacity] = useState(props.fillOpacity)
  useEffect(() => setOpacity(props.fillOpacity), [props.fillOpacity])
  const known = LAYER_COLORS.some((item) => item.hex.toLowerCase() === props.color.toLowerCase())
  const colors = known ? LAYER_COLORS : [{ hex: props.color, label: "layerColor" as const }, ...LAYER_COLORS]
  return (
    <div className="mb-2 flex flex-col gap-2 rounded-xl bg-neutral-50 p-2">
      <div className="flex flex-wrap gap-1">
        {colors.map((item) => {
          const selected = item.hex.toLowerCase() === props.color.toLowerCase()
          return (
            <button
              key={item.hex}
              type="button"
              aria-label={t(item.label)}
              aria-pressed={selected}
              title={t(item.label)}
              className={selected ? "h-7 w-7 rounded-full ring-2 ring-neutral-900 ring-offset-1" : "h-7 w-7 rounded-full"}
              style={{ backgroundColor: item.hex }}
              onClick={() => props.onColor(item.hex)}
            />
          )
        })}
      </div>
      {props.fields.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          <button type="button" aria-label={t("labelOff")} aria-pressed={props.labelAttribute == null} className={props.labelAttribute == null ? "h-7 rounded-full bg-neutral-900 px-2 text-xs text-white" : "h-7 rounded-full bg-white px-2 text-xs"} onClick={() => props.onLabel(null)}>
            {t("labelOff")}
          </button>
          {props.fields.map((field) => (
            <button key={field} type="button" aria-label={t("labelField", { name: field })} aria-pressed={props.labelAttribute === field} className={props.labelAttribute === field ? "h-7 rounded-full bg-neutral-900 px-2 text-xs text-white" : "h-7 rounded-full bg-white px-2 text-xs"} onClick={() => props.onLabel(field)}>
              {field}
            </button>
          ))}
        </div>
      ) : null}
      {props.geometryType === "Polygon" ? (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          aria-label={t("fillOpacity")}
          aria-valuetext={t("fillOpacityValue", { n: Math.round(opacity * 100) })}
          className="h-8 w-full accent-neutral-800"
          value={opacity}
          onChange={(event) => setOpacity(Number(event.target.value))}
          onPointerUp={(event) => props.onOpacity(Number(event.currentTarget.value))}
          onKeyUp={(event) => props.onOpacity(Number(event.currentTarget.value))}
        />
      ) : null}
    </div>
  )
}
