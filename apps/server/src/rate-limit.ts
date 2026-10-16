import type { Context, Next } from "hono"

type Hit = { count: number; reset: number }

/** Small in-memory cap. One server process, so a shared map is enough. */
export function rateLimit(limit: number, windowMs: number) {
  const hits = new Map<string, Hit>()
  return async (c: Context, next: Next) => {
    if (hits.size > 500) {
      const now = Date.now()
      for (const [key, hit] of hits) {
        if (hit.reset < now) hits.delete(key)
      }
    }
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local"
    const now = Date.now()
    const current = hits.get(ip)
    if (!current || current.reset < now) {
      hits.set(ip, { count: 1, reset: now + windowMs })
      await next()
      return
    }
    current.count += 1
    if (current.count > limit) {
      return c.json(
        { code: "rate_limited", message: "Too many requests", requestId: c.get("requestId") as string | undefined },
        429,
      )
    }
    await next()
  }
}
