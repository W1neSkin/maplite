import { zipSync, strToU8 } from "fflate"
import { describe, expect, it } from "vitest"
import { loadBytes } from "../src/import/load.js"
import { classifyPrj } from "../src/import/wkt.js"

const WGS84 = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]'
const PULKOVO = 'PROJCS["Pulkovo 1942 / Gauss-Kruger zone 7",GEOGCS["Pulkovo 1942",DATUM["Pulkovo_1942",SPHEROID["Krassovsky",6378245,298.3]]],PARAMETER["Central_Meridian",39],PARAMETER["False_Easting",7500000],AUTHORITY["EPSG","28407"]]'

function pointShp(x: number, y: number): Uint8Array {
  const bytes = new Uint8Array(100 + 8 + 4 + 16)
  const view = new DataView(bytes.buffer)
  view.setInt32(0, 9994, false)
  view.setInt32(24, bytes.byteLength / 2, false)
  view.setInt32(28, 1000, true)
  view.setInt32(32, 1, true)
  view.setInt32(100, 1, false)
  view.setInt32(104, 10, false)
  view.setInt32(108, 1, true)
  view.setFloat64(112, x, true)
  view.setFloat64(120, y, true)
  return bytes
}

function nameDbf(value: string): Uint8Array {
  const headerSize = 65
  const recordSize = 21
  const bytes = new Uint8Array(headerSize + recordSize + 1)
  const view = new DataView(bytes.buffer)
  bytes[0] = 3
  view.setUint32(4, 1, true)
  view.setUint16(8, headerSize, true)
  view.setUint16(10, recordSize, true)
  for (let index = 0; index < 4; index += 1) bytes[32 + index] = "NAME".charCodeAt(index)
  bytes[43] = "C".charCodeAt(0)
  bytes[48] = 20
  bytes[64] = 0x0d
  bytes[headerSize] = 0x20
  for (let index = 0; index < value.length; index += 1) bytes[headerSize + 1 + index] = value.charCodeAt(index)
  bytes[bytes.byteLength - 1] = 0x1a
  return bytes
}

function archive(prj: string, x: number, y: number): Uint8Array {
  return zipSync({
    "gate.shp": pointShp(x, y),
    "gate.dbf": nameDbf("Gate"),
    "gate.prj": strToU8(prj),
    "gate.cpg": strToU8("UTF-8"),
  })
}

describe("classifyPrj", () => {
  it("accepts geographic WGS 84 and a catalogued Gauss-Kruger zone", () => {
    expect(classifyPrj(WGS84).kind).toBe("wgs84")
    const pulkovo = classifyPrj(PULKOVO)
    expect(pulkovo.kind).toBe("projected")
    if (pulkovo.kind === "projected") expect(pulkovo.profile.id).toBe("sk42-gk6-z7")
  })

  it("refuses a coordinate system that is not in the catalog", () => {
    expect(classifyPrj(null)).toEqual({ kind: "blocked", code: "missing" })
    expect(classifyPrj('PROJCS["Local grid",GEOGCS["Unknown",DATUM["Unknown",SPHEROID["Bessel",6377397,299.15]]]]').kind).toBe("blocked")
  })
})

describe("loadBytes", () => {
  it("reads a WGS 84 point and keeps its name", () => {
    const loaded = loadBytes("gate.zip", archive(WGS84, -0.16, 51.51))
    expect(loaded.kind).toBe("ready")
    if (loaded.kind !== "ready") return
    expect(loaded.features[0]?.name).toBe("Gate")
    expect(loaded.features[0]?.geometry.coordinates[0]).toBeCloseTo(-0.16)
    expect(loaded.operationName).toBeNull()
  })

  it("turns a Pulkovo zone 7 point into longitude and latitude", () => {
    const loaded = loadBytes("gate.zip", archive(PULKOVO, 7314559.875466309, 6101179.875424513))
    expect(loaded.kind).toBe("ready")
    if (loaded.kind !== "ready") return
    expect(loaded.operationName).toContain("Pulkovo 1942")
    const [longitude, latitude] = loaded.features[0]?.geometry.coordinates as [number, number]
    expect(longitude).toBeCloseTo(36.1, 4)
    expect(latitude).toBeCloseTo(55, 4)
  })

  it("does not import a shapefile whose projection is unknown", () => {
    const loaded = loadBytes("gate.zip", archive('PROJCS["Local",GEOGCS["Unknown",DATUM["D_Unknown",SPHEROID["Bessel",6377397,299.15]]]]', 1, 2))
    expect(loaded).toEqual({ kind: "blocked", code: "unknown" })
  })
})
