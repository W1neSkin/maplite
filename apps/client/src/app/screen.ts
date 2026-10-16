export type ScreenNotice = "loading" | "server" | "empty" | "ready"

export function screenNotice(input: { loading: boolean; failed: boolean; featureCount: number }): ScreenNotice {
  if (input.loading) return "loading"
  if (input.failed) return "server"
  if (input.featureCount === 0) return "empty"
  return "ready"
}
