import { describe, expect, it } from "vitest"
import { qrForPage, readEnrollment } from "../src/app/enrollment.js"

describe("enrollment picture", () => {
  it("reads the server and the code from the QR text", () => {
    expect(readEnrollment('{"serverUrl":"http://127.0.0.1:3847","code":"ABCD-EFGH"}')).toEqual({
      code: "ABCD-EFGH",
      serverUrl: "http://127.0.0.1:3847",
    })
    expect(readEnrollment("ABCD-EFGH")).toEqual({ code: "ABCD-EFGH", serverUrl: null })
  })

  it("puts the permanent page address into the QR", () => {
    const picture = qrForPage('{"serverUrl":"https://old.example","code":"ABCD"}')
    expect(JSON.parse(picture)).toEqual({ code: "ABCD", serverUrl: "https://maplite.map.example" })
  })
})
