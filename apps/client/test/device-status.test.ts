import { describe, expect, it } from "vitest"
import { deviceFace, nextMode } from "../src/app/device-status.js"

const now = Date.parse("2026-10-16T18:00:00.000Z")

describe("device command status", () => {
  it("waits for confirmation and treats silence as a closed phone", () => {
    expect(deviceFace({
      desired: "live",
      actual: "off",
      lastSeenAt: "2026-10-16T17:59:40.000Z",
      ackedAt: null,
      result: null,
      expiresAt: "2026-10-16T18:10:00.000Z",
      now,
    })).toBe("pending")
    expect(deviceFace({
      desired: "live",
      actual: "off",
      lastSeenAt: "2026-10-16T17:50:00.000Z",
      ackedAt: null,
      result: null,
      expiresAt: "2026-10-16T18:10:00.000Z",
      now,
    })).toBe("closed")
  })

  it("keeps a refusal distinct from a running phone", () => {
    expect(deviceFace({
      desired: "track",
      actual: "permissionDenied",
      lastSeenAt: "2026-10-16T17:59:50.000Z",
      ackedAt: "2026-10-16T17:59:50.000Z",
      result: "permissionDenied",
      expiresAt: "2026-10-16T18:10:00.000Z",
      now,
    })).toBe("permission")
    expect(deviceFace({
      desired: "live",
      actual: "off",
      lastSeenAt: "2026-10-16T17:59:50.000Z",
      ackedAt: "2026-10-16T17:59:50.000Z",
      result: "remoteOff",
      expiresAt: "2026-10-16T18:10:00.000Z",
      now,
    })).toBe("remoteOff")
    expect(nextMode("live", "track")).toBe("both")
    expect(nextMode("both", "live")).toBe("track")
    expect(nextMode("track", "off")).toBe("off")
  })
})
