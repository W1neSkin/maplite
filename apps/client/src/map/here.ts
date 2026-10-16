import { accuracyRing } from "@cartography/geo-core"
import Feature from "ol/Feature"
import Point from "ol/geom/Point"
import Polygon from "ol/geom/Polygon"
import VectorSource from "ol/source/Vector"
import Circle from "ol/style/Circle"
import Fill from "ol/style/Fill"
import Stroke from "ol/style/Stroke"
import Style from "ol/style/Style"
import Text from "ol/style/Text"
import { t } from "../i18n/translate.js"

export const HERE_ZOOM = 16

export type HereFix = {
  coordinate: [number, number]
  accuracyM: number | null
}

/** Point in front, geodesic accuracy ring behind it. */
export function hereStyle(feature: { getGeometry(): { getType(): string } | undefined; get(key: string): unknown }): Style {
  if (feature.getGeometry()?.getType() === "Polygon") {
    return new Style({
      fill: new Fill({ color: "rgba(37,99,235,0.15)" }),
      stroke: new Stroke({ color: "rgba(37,99,235,0.85)", width: 1.5 }),
      zIndex: 199999,
    })
  }
  const label = feature.get("accuracyLabel")
  return new Style({
    image: new Circle({
      radius: 8,
      fill: new Fill({ color: "#2563eb" }),
      stroke: new Stroke({ color: "#ffffff", width: 3 }),
    }),
    text: typeof label === "string" && label.length > 0
      ? new Text({
          text: label,
          offsetY: 18,
          font: "12px sans-serif",
          fill: new Fill({ color: "#1e3a8a" }),
          stroke: new Stroke({ color: "#ffffff", width: 3 }),
        })
      : undefined,
    zIndex: 200000,
  })
}

export function placeHere(
  source: VectorSource,
  project: (coordinate: [number, number]) => number[],
  fix: HereFix,
): void {
  source.clear()
  const point = new Feature(new Point(project(fix.coordinate)))
  const accuracy = fix.accuracyM
  // A missing or zero figure is not drawn as a ring. A huge figure still is: it shows a poor fix.
  if (accuracy != null && Number.isFinite(accuracy) && accuracy > 0) {
    point.set("accuracyLabel", t("accuracyMeters", { meters: Math.round(accuracy) }))
    const ring = accuracyRing(fix.coordinate, accuracy).map((coordinate) => project([coordinate[0], coordinate[1]]))
    source.addFeature(new Feature(new Polygon([ring])))
  }
  source.addFeature(point)
}

/** One fix, including the accuracy the device reported. The caller decides whether a failure should be shown. */
export function readPosition(): Promise<HereFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unavailable"))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        coordinate: [position.coords.longitude, position.coords.latitude],
        accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      }),
      () => reject(new Error("unavailable")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    )
  })
}
