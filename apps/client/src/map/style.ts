import Feature from "ol/Feature"
import type { FeatureLike } from "ol/Feature"
import LineString from "ol/geom/LineString"
import Point from "ol/geom/Point"
import Polygon from "ol/geom/Polygon"
import Circle from "ol/style/Circle"
import Fill from "ol/style/Fill"
import Stroke from "ol/style/Stroke"
import Style from "ol/style/Style"
import Text from "ol/style/Text"

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

/** The edit gesture only marks the vertex under the finger, so the selected shape draws the rest. */
function vertexHandles(geometry: ReturnType<FeatureLike["getGeometry"]>): Style[] {
  const coordinates = geometry instanceof LineString
    ? geometry.getCoordinates()
    : geometry instanceof Polygon
      ? (geometry.getCoordinates()[0] ?? []).slice(0, -1)
      : []
  return coordinates.map((coordinate) => new Style({
    geometry: new Point(coordinate),
    image: new Circle({ radius: 6, fill: new Fill({ color: "#ffffff" }), stroke: new Stroke({ color: BLUE, width: 2 }) }),
    zIndex: 200001,
  }))
}

function withLabel(feature: FeatureLike, styles: Style[], rank: number): Style[] {
  const text = feature.get("label")
  if (typeof text !== "string" || text === "" || feature.get("draft") === true) return styles
  const type = feature.getGeometry()?.getType()
  styles.push(new Style({
    text: new Text({
      text,
      font: "600 12px sans-serif",
      fill: new Fill({ color: "#111827" }),
      stroke: new Stroke({ color: "#ffffff", width: 3 }),
      placement: type === "LineString" ? "line" : "point",
      offsetY: type === "Point" ? -18 : 0,
      overflow: true,
    }),
    zIndex: rank + 1,
  }))
  return styles
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
    const drawn = [
      new Style({ stroke: line("#ffffff", width + (selected ? 5 : 3)), zIndex: rank }),
      new Style({ stroke: line(selected || draft ? BLUE : color, width, draft), zIndex: rank }),
    ]
    return withLabel(feature, selected ? [...drawn, ...vertexHandles(feature.getGeometry())] : drawn, rank)
  }
  if (type === "Polygon") {
    const opacity = selected ? Math.min(0.65, fillOpacity + 0.3) : fillOpacity
    const drawn = new Style({
      stroke: line(selected || draft ? BLUE : color, selected ? strokeWidth + 1 : strokeWidth, draft),
      fill: new Fill({ color: hexToRgba(color, opacity) }),
      zIndex: rank,
    })
    return withLabel(feature, selected ? [drawn, ...vertexHandles(feature.getGeometry())] : [drawn], rank)
  }
  return withLabel(feature, [new Style({
    image: new Circle({
      radius: selected ? 12 : 8,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: selected ? BLUE : "#ffffff", width: selected ? 3 : 2 }),
    }),
    zIndex: rank,
  })], rank)
}

export function paintFeature(feature: Feature, color: string, fillOpacity: number, strokeWidth: number): void {
  feature.set("color", color)
  feature.set("fillOpacity", fillOpacity)
  feature.set("strokeWidth", strokeWidth)
}
