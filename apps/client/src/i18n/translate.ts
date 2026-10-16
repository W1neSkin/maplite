import { messages, type MessageKey } from "./en.js"

/** Every user-facing sentence comes from the English catalog. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = messages[key]
  if (!vars) return text
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}
