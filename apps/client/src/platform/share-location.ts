import { registerPlugin } from "@capacitor/core"

export interface ShareLocationPlugin {
  start(options: { server: string; token: string; projectId: string; subjectId: string; name: string }): Promise<void>
  rename(options: { name: string }): Promise<void>
  stop(): Promise<void>
}

/** Android foreground service. The browser has no implementation and the caller keeps the page watcher. */
export const ShareLocation = registerPlugin<ShareLocationPlugin>("ShareLocation")
