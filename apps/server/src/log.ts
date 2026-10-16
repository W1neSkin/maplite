/** Structured log line. Do not pass tokens, coordinates, or file contents. */
export function logEvent(event: Record<string, string | number | boolean | null>): void {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...event }))
}
