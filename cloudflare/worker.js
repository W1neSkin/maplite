// Permanent public address. The map process stays on its own machine.
// This Worker only forwards each request to that machine.
const PUBLIC_URL = "https://maplite.map.example"

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const origin = new URL(request.url)
    origin.protocol = "http:"
    origin.hostname = "map.enzonic.dev"
    origin.port = "25835"
    try {
      const response = await fetch(origin, {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
      })
      if (request.method === "POST" && url.pathname.endsWith("/enrollments")) {
        return stampEnrollment(response)
      }
      return new Response(response.body, { status: response.status, headers: response.headers })
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : "origin unreachable"
      return new Response(`${message} ${url.pathname}`, { status: 502 })
    }
  },
}

// The machine still writes its temporary tunnel name into the QR.
// The phone must be sent to this permanent address instead.
async function stampEnrollment(response) {
  const data = await response.json()
  if (data && typeof data.qrText === "string") {
    try {
      const picture = JSON.parse(data.qrText)
      picture.serverUrl = PUBLIC_URL
      data.qrText = JSON.stringify({ code: picture.code, serverUrl: PUBLIC_URL })
    } catch {
      // Leave a code the phone cannot use rather than invent one.
    }
  }
  const headers = new Headers(response.headers)
  headers.delete("content-length")
  return new Response(JSON.stringify(data), { status: response.status, headers })
}
