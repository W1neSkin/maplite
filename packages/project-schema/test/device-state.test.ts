import { describe, expect, it } from "vitest"
import { actualAfterAck, actualAfterFailure, commandExpired, TRACK_PROFILES } from "../src/index.js"

describe("device state", () => {
  it("does not treat a desired mode as the actual mode until ack", () => {
    expect(actualAfterAck("track")).toBe("tracking")
    expect(actualAfterAck("live")).toBe("live")
    expect(actualAfterAck("off")).toBe("off")
    expect(actualAfterFailure("terminated")).toBe("appTerminated")
    expect(actualAfterFailure("blocked")).toBe("error")
  })

  it("rejects an expired command", () => {
    expect(commandExpired(new Date(Date.now() - 1000).toISOString())).toBe(true)
    expect(commandExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false)
    expect(TRACK_PROFILES.balanced.distanceM).toBeGreaterThan(TRACK_PROFILES.precise.distanceM)
  })
})
