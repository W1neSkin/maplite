/**
 * Client-minted ids. A phone has to create a feature while offline, so the
 * server is not the one handing out identifiers.
 * UUIDv7 puts the time in front. Ids from the same device then sort in the
 * order they were created, which keeps pages of changes stable.
 */

type WebCrypto = { getRandomValues: (bytes: Uint8Array) => Uint8Array }

function fillRandom(bytes: Uint8Array): Uint8Array {
  // Call this as a method. Pulling getRandomValues off crypto clears `this`
  // and Node then throws "Value of this must be of type Crypto".
  const cryptoApi = (globalThis as { crypto?: WebCrypto }).crypto
  if (!cryptoApi) throw new Error("crypto.getRandomValues is not available")
  return cryptoApi.getRandomValues(bytes)
}

export function createId(now = Date.now()): string {
  const bytes = fillRandom(new Uint8Array(16))
  const time = BigInt(now)
  bytes[0] = Number((time >> 40n) & 0xffn)
  bytes[1] = Number((time >> 32n) & 0xffn)
  bytes[2] = Number((time >> 24n) & 0xffn)
  bytes[3] = Number((time >> 16n) & 0xffn)
  bytes[4] = Number((time >> 8n) & 0xffn)
  bytes[5] = Number(time & 0xffn)
  // Version 7, and the RFC 4122 variant bits.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
