import Feature from "ol/Feature"
import LineString from "ol/geom/LineString"
import VectorSource from "ol/source/Vector"

/** Wider views use a coarser grid so the map is not covered in lines. */
export function gridStep(widthM: number): number {
  if (widthM > 80_000) return 10_000
  if (widthM > 20_000) return 5_000
  return 1_000
}

export function updateKmGrid(source: VectorSource, code: string, extent: number[]): void {
  source.clear()
  if (code === "EPSG:3857" || code === "EPSG:4326" || extent.length < 4) return
  const [minX, minY, maxX, maxY] = extent
  if (![minX, minY, maxX, maxY].every((value) => Number.isFinite(value))) return
  const step = gridStep(maxX - minX)
  const x0 = Math.floor(minX / step) * step
  const y0 = Math.floor(minY / step) * step
  let count = 0
  for (let x = x0; x <= maxX && count < 30; x += step) {
    const feature = new Feature(new LineString([[x, minY], [x, maxY]]))
    feature.set("label", String(Math.round(x / 1000)))
    source.addFeature(feature)
    count += 1
  }
  for (let y = y0; y <= maxY && count < 60; y += step) {
    const feature = new Feature(new LineString([[minX, y], [maxX, y]]))
    feature.set("label", String(Math.round(y / 1000)))
    source.addFeature(feature)
    count += 1
  }
}
