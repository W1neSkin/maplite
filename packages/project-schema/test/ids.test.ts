import { describe, expect, it } from "vitest"
import { createId } from "../src/index.js"

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe("createId", () => {
  it("issues a uuid v7 that sorts by time", () => {
    const earlier = createId(1_700_000_000_000)
    const later = createId(1_800_000_000_000)
    expect(earlier).toMatch(UUID_V7)
    expect(earlier < later).toBe(true)
    expect(createId()).not.toBe(createId())
  })
})
