import { registerPlugin } from "@capacitor/core"

export interface ShareLocationPlugin {
  start(options: { server: string; token: string; projectId: string; subjectId: string; name: string }): Promise<void>
  configure(options: { server: string; token: string; projectId: string; subjectId: string; name: string; share: boolean; record: boolean }): Promise<void>
  readTrack(): Promise<{ points: [number, number][] }>
  clearTrack(): Promise<void>
  rename(options: { name: string }): Promise<void>
  stop(): Promise<void>
  locationAllowed(): Promise<{ granted: boolean }>
  readOutbox(options: { projectId: string }): Promise<{ ops: unknown[]; docs: unknown[] }>
  writeOutbox(options: { projectId: string; body: string }): Promise<void>
  allowRemote(options: { allow: boolean }): Promise<void>
}

/** Android foreground service. The browser has no implementation and the caller keeps the page watcher. */
export const ShareLocation = registerPlugin<ShareLocationPlugin>("ShareLocation")
