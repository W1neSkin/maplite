const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 })

/**
 * Times are stored in UTC. The device clock zone is only used at display time.
 * Lengths and areas stay metric.
 */

export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

export function formatLength(metres: number): string {
  if (Math.abs(metres) >= 1000) return `${formatNumber(metres / 1000)} km`
  return `${formatNumber(metres)} m`
}

export function formatArea(squareMetres: number): string {
  const absolute = Math.abs(squareMetres)
  if (absolute >= 1_000_000) return `${formatNumber(squareMetres / 1_000_000)} km²`
  if (absolute >= 10_000) return `${formatNumber(squareMetres / 10_000)} ha`
  return `${formatNumber(squareMetres)} m²`
}

export function formatSpeed(metresPerSecond: number): string {
  return `${formatNumber(metresPerSecond * 3.6)} km/h`
}

export function formatDecimalDegrees(value: number): string {
  const text = new Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(value)
  return `${text}°`
}

export function formatDms(value: number): string {
  const sign = value < 0 ? "-" : ""
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutesFloat = (absolute - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = (minutesFloat - minutes) * 60
  const secondText = new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(seconds)
  return `${sign}${degrees}° ${minutes}′ ${secondText}″`
}

export function formatWhen(isoUtc: string): string {
  const date = new Date(isoUtc)
  if (Number.isNaN(date.getTime())) return isoUtc
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date)
}
