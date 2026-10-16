import type { Context } from "hono"
import type { AppEnv } from "./app-env.js"

export function apiError(
  c: Context<AppEnv>,
  status: 400 | 401 | 404 | 409 | 413 | 429 | 503,
  code: string,
  message: string,
) {
  return c.json({ code, message, requestId: c.get("requestId") }, status)
}

export function invalidToken(c: Context<AppEnv>) {
  return apiError(c, 401, "invalid_token", "Invalid project token")
}
