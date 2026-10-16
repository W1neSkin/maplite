import Feature from "ol/Feature"
import type { FeatureLike } from "ol/Feature"
import Circle from "ol/style/Circle"
import Fill from "ol/style/Fill"
import Stroke from "ol/style/Stroke"
import Style from "ol/style/Style"

const BLUE = "#2563eb"

function hexToRgba(hex: string, opacity: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match?.[1]) return hex
  const value = Number.parseInt(match[1], 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`
}

function line(color: string, width: number, dashed = false): Stroke {
  return new Stroke({ color, width, lineCap: "round", lineJoin: "round", lineDash: dashed ? [6, 4] : undefined })
}

export function featureStyle(feature: FeatureLike): Style | Style[] {
  const color = String(feature.get("color") ?? "#1f4d3a")
  const fillOpacity = Number(feature.get("fillOpacity") ?? 0.25)
  const strokeWidth = Number(feature.get("strokeWidth") ?? 2)
  const selected = feature.get("selected") === true
  const stack = Number(feature.get("stack") ?? 0)
  const rank = stack + (selected ? 100000 : 0)
  const type = feature.getGeometry()?.getType()
  const draft = feature.get("draft") === true
  if (type === "LineString") {
    const width = selected ? strokeWidth + 3 : strokeWidth
    return [
      new Style({ stroke: line("#ffffff", width + (selected ? 5 : 3)), zIndex: rank }),
      new Style({ stroke: line(selected || draft ? BLUE : color, width, draft), zIndex: rank }),
    ]
  }
  if (type === "Polygon") {
    const opacity = selected ? Math.min(0.65, fillOpacity + 0.3) : fillOpacity
    return new Style({
      stroke: line(selected || draft ? BLUE : color, selected ? strokeWidth + 1 : strokeWidth, draft),
      fill: new Fill({ color: hexToRgba(color, opacity) }),
      zIndex: rank,
    })
  }
  return new Style({
    image: new Circle({
      radius: selected ? 12 : 8,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: selected ? BLUE : "#ffffff", width: selected ? 3 : 2 }),
    }),
    zIndex: rank,
  })
}

export function paintFeature(feature: Feature, color: string, fillOpacity: number, strokeWidth: number): void {
  feature.set("color", color)
  feature.set("fillOpacity", fillOpacity)
  feature.set("strokeWidth", strokeWidth)
}
