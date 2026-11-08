import { describe, expect, it } from "vitest"
import { readEnrollment } from "../src/app/enrollment.js"

describe("enrollment picture", () => {
  it("reads the server and the code from the QR text", () => {
    expect(readEnrollment('{"serverUrl":"http://127.0.0.1:3847","code":"ABCD-EFGH"}')).toEqual({
      code: "ABCD-EFGH",
      serverUrl: "http://127.0.0.1:3847",
    })
    expect(readEnrollment("ABCD-EFGH")).toEqual({ code: "ABCD-EFGH", serverUrl: null })
  })
})
