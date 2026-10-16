import { defaultOperationFor, profileByEpsg, profileById, profilesForDatum, type CoordinateOperation, type CrsProfile, type EastingNotation } from "@cartography/geo-core"

export type CrsChoice =
  | { kind: "wgs84" }
  | { kind: "zone"; datum: "SK42" | "SK95" | "GSK2011"; zone: number; notation?: EastingNotation }

export function choiceToPrj(choice: CrsChoice): PrjDecision {
  if (choice.kind === "wgs84") return { kind: "wgs84" }
  const profile = profileById(`${choice.datum.toLowerCase()}-gk6-z${choice.zone}`)
  if (!profile) return { kind: "blocked", code: "unknown" }
  return { kind: "projected", profile, operation: defaultOperationFor(profile.datum), notation: choice.notation ?? "full" }
}

export type PrjDecision =
  | { kind: "wgs84" }
  | { kind: "projected"; profile: CrsProfile; operation: CoordinateOperation; notation: EastingNotation }
  | { kind: "geographic"; operation: CoordinateOperation }
  | { kind: "blocked"; code: "missing" | "unknown" }

function rootKind(wkt: string): string {
  return /^([A-Za-z0-9_]+)\s*\[/.exec(wkt.trim())?.[1]?.toUpperCase() ?? ""
}

function datumOf(wkt: string): "SK42" | "SK95" | "GSK2011" | "WGS84" | null {
  const text = wkt.toLowerCase()
  if (text.includes("gsk-2011") || text.includes("gsk_2011") || text.includes("gsk2011")) return "GSK2011"
  if (text.includes("pulkovo_1995") || text.includes("pulkovo 1995")) return "SK95"
  if (text.includes("pulkovo_1942") || text.includes("pulkovo 1942")) return "SK42"
  if (text.includes("wgs_1984") || text.includes("wgs 84") || text.includes("wgs84")) return "WGS84"
  return null
}

function parameter(wkt: string, name: string): number | null {
  const match = new RegExp(`PARAMETER\\["${name}",\\s*([+-]?\\d+(?:\\.\\d+)?)\\]`, "i").exec(wkt)
  return match ? Number(match[1]) : null
}

function lastEpsg(wkt: string): number | null {
  const codes = [...wkt.matchAll(/AUTHORITY\["EPSG","(\d+)"\]/gi)].map((match) => Number(match[1]))
  return codes.at(-1) ?? null
}

function notationFor(falseEasting: number | null): EastingNotation {
  return falseEasting != null && falseEasting < 1_000_000 ? "truncated" : "full"
}

/** Match a .prj to a catalogued system. Unknown systems are refused. */
export function classifyPrj(wkt: string | null | undefined): PrjDecision {
  if (!wkt || !wkt.trim()) return { kind: "blocked", code: "missing" }
  const kind = rootKind(wkt)
  const datum = datumOf(wkt)
  if (kind === "GEOGCS") {
    if (datum === "WGS84") return { kind: "wgs84" }
    if (datum) return { kind: "geographic", operation: defaultOperationFor(datum) }
    return { kind: "blocked", code: "unknown" }
  }
  if (kind !== "PROJCS") return { kind: "blocked", code: "unknown" }
  const byCode = profileByEpsg(lastEpsg(wkt) ?? -1)
  const meridian = parameter(wkt, "Central_Meridian") ?? parameter(wkt, "longitude_of_origin")
  const profile =
    byCode ??
    (datum && datum !== "WGS84" && meridian != null
      ? profilesForDatum(datum).find((item) => Math.abs(item.centralMeridianDeg - meridian) < 0.01)
      : undefined)
  if (!profile) return { kind: "blocked", code: "unknown" }
  return {
    kind: "projected",
    profile,
    operation: defaultOperationFor(profile.datum),
    notation: notationFor(parameter(wkt, "False_Easting")),
  }
}
