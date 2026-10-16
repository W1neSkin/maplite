/**
 * Reveal a feature in the free map area without OpenLayers.
 * Screen y grows downward. padding is [top, right, bottom, left].
 * Positive pan dx: the feature is too far right. Positive pan dy: it is too low.
 */
export const FRAME_MARGIN = 8

export type ScreenBox = {
  left: number
  top: number
  right: number
  bottom: number
}

export type FrameAction =
  | { kind: "clear" }
  | { kind: "pan"; dx: number; dy: number }
  | { kind: "zoom-out" }

export function frameFeature(
  feature: ScreenBox,
  viewport: { width: number; height: number },
  padding: readonly [number, number, number, number],
  margin = FRAME_MARGIN,
): FrameAction {
  const [padTop, padRight, padBottom, padLeft] = padding.map((value) => Math.max(0, value))
  const free = {
    left: padLeft + margin,
    top: padTop + margin,
    right: viewport.width - padRight - margin,
    bottom: viewport.height - padBottom - margin,
  }
  const freeWidth = free.right - free.left
  const freeHeight = free.bottom - free.top
  const featureWidth = feature.right - feature.left
  const featureHeight = feature.bottom - feature.top
  if (freeWidth <= 0 || freeHeight <= 0 || featureWidth > freeWidth || featureHeight > freeHeight) return { kind: "zoom-out" }
  let dx = 0
  let dy = 0
  if (feature.right > free.right) dx += feature.right - free.right
  if (feature.left < free.left) dx -= free.left - feature.left
  if (feature.bottom > free.bottom) dy += feature.bottom - free.bottom
  if (feature.top < free.top) dy -= free.top - feature.top
  if (dx === 0 && dy === 0) return { kind: "clear" }
  return { kind: "pan", dx, dy }
}

/** Map y grows upward, so a positive screen dy is subtracted from the view center. */
export function panToCenterDelta(dx: number, dy: number, resolution: number): [number, number] {
  return [dx * resolution, -dy * resolution]
}

/** Project an extent to a screen box. maxY is the top edge because map y grows upward. */
export function extentToScreen(
  extent: readonly [number, number, number, number],
  center: readonly [number, number],
  resolution: number,
  size: readonly [number, number],
): ScreenBox {
  const [minX, minY, maxX, maxY] = extent
  const [centerX, centerY] = center
  const [width, height] = size
  const xOf = (x: number) => (x - centerX) / resolution + width / 2
  const yOf = (y: number) => (centerY - y) / resolution + height / 2
  return { left: xOf(minX), right: xOf(maxX), top: yOf(maxY), bottom: yOf(minY) }
}

/**
 * Turn overlay rectangles into edge padding.
 * A wide sheet only insets the bottom. A control in a corner insets both of its edges.
 */
export function paddingFromOverlays(stage: ScreenBox, overlays: readonly ScreenBox[]): [number, number, number, number] {
  let top = 0
  let right = 0
  let bottom = 0
  let left = 0
  const stageWidth = stage.right - stage.left
  const stageHeight = stage.bottom - stage.top
  if (stageWidth <= 0 || stageHeight <= 0) return [0, 0, 0, 0]
  for (const rect of overlays) {
    if (rect.right <= stage.left || rect.left >= stage.right || rect.bottom <= stage.top || rect.top >= stage.bottom) continue
    const distTop = rect.top - stage.top
    const distBottom = stage.bottom - rect.bottom
    if (distTop <= distBottom) top = Math.max(top, rect.bottom - stage.top)
    else bottom = Math.max(bottom, stage.bottom - rect.top)
    const relX = ((rect.left + rect.right) / 2 - stage.left) / stageWidth
    if (relX > 0.7) right = Math.max(right, stage.right - rect.left)
    else if (relX < 0.3) left = Math.max(left, rect.right - stage.left)
  }
  return [Math.min(top, stageHeight), Math.min(right, stageWidth), Math.min(bottom, stageHeight), Math.min(left, stageWidth)]
}
