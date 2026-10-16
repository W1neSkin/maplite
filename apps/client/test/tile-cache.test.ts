import { describe, expect, it } from "vitest"
import { tileKey } from "../src/map/tile-cache.js"

describe("offline tile paths", () => {
  it("reads z/x/y.png and ignores other files", () => {
    expect(tileKey("pack/14/9488/5432.png")).toBe("14/9488/5432")
    expect(tileKey("14\\9488\\5432.PNG")).toBe("14/9488/5432")
    expect(tileKey("readme.txt")).toBeNull()
  })
})