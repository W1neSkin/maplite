import Feature from "ol/Feature"
import Point from "ol/geom/Point"
import { fromLonLat } from "ol/proj"
import VectorSource from "ol/source/Vector"
import Circle from "ol/style/Circle"
import Fill from "ol/style/Fill"
import Stroke from "ol/style/Stroke"
import Style from "ol/style/Style"

export const HERE_ZOOM = 16

export function hereStyle(): Style {
  return new Style({
    image: new Circle({
      radius: 8,
      fill: new Fill({ color: "#2563eb" }),
      stroke: new Stroke({ color: "#ffffff", width: 3 }),
    }),
    zIndex: 200000,
  })
}

export function placeHere(source: VectorSource, coordinate: [number, number]): void {
  source.clear()
  source.addFeature(new Feature(new Point(fromLonLat(coordinate))))
}

/** One fix. The caller decides whether a failure should be shown. */
export function readPosition(): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unavailable"))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.longitude, position.coords.latitude]),
      () => reject(new Error("unavailable")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    )
  })
}
