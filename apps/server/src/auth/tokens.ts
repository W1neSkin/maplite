import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/** 256 bits, encoded so it can travel in an Authorization header. */
export function newSecret(): string {
  return randomBytes(32).toString("base64url")
}

/**
 * Fast hash on purpose. The input is already a random 256-bit secret,
 * not a password a person chose.
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex")
}

export function secretsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
