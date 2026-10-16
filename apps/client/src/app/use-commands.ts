import { useEffect, useRef } from "react"
import { ShareLocation } from "../platform/share-location.js"
import { readSelfCommand, reportSelf } from "../sync/channel.js"
import { isPhoneApp, type Session } from "./connection.js"
import { modeOf } from "./device-status.js"

const REMOTE_KEY = "cartography.remoteControl"

export function remoteAllowed(): boolean {
  return localStorage.getItem(REMOTE_KEY) === "1"
}

export function rememberRemote(allow: boolean): void {
  localStorage.setItem(REMOTE_KEY, allow ? "1" : "0")
  if (!isPhoneApp()) return
  void ShareLocation.allowRemote({ allow }).catch(() => undefined)
}

/**
 * The phone reads a command while it is open. The location service does the same
 * with the screen off, but only after it is already running. Force-stop stops both.
 */
export function useCommands(
  session: Session,
  share: boolean,
  record: boolean,
  setSharing: (value: boolean) => void,
  setRecording: (value: boolean) => void,
) {
  const setShareRef = useRef(setSharing)
  const setRecordRef = useRef(setRecording)
  setShareRef.current = setSharing
  setRecordRef.current = setRecording
  useEffect(() => {
    if (!isPhoneApp() || session.kind !== "device" || !session.deviceId) return
    let cancel = false
    const apply = async (mode: string) => {
      const nextShare = mode === "live" || mode === "both"
      const nextRecord = mode === "track" || mode === "both"
      if (nextShare || nextRecord) {
        try {
          const allowed = await ShareLocation.locationAllowed()
          if (!allowed.granted) return "permissionDenied"
        } catch {
          return "permissionDenied"
        }
      }
      setShareRef.current(nextShare)
      setRecordRef.current(nextRecord)
      return mode
    }
    const tick = async () => {
      const state = await readSelfCommand(session)
      if (cancel || !state?.command) {
        if (state && !state.controlled && modeOf(share, record) !== "off") {
          await reportSelf(session, { actual: modeOf(share, record), adopt: true })
        }
        return
      }
      if (!remoteAllowed()) {
        await reportSelf(session, { commandId: state.command.id, actual: modeOf(share, record), result: "remoteOff" })
        return
      }
      const actual = await apply(state.command.mode)
      if (cancel) return
      await reportSelf(session, { commandId: state.command.id, actual, result: actual })
    }
    const follow = () => {
      if (document.visibilityState !== "visible") return
      void readSelfCommand(session).then((state) => {
        if (cancel || !state || state.command || !state.controlled) return
        if (state.desired !== modeOf(share, record)) void apply(state.desired)
      })
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 15_000)
    document.addEventListener("visibilitychange", follow)
    return () => {
      cancel = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", follow)
    }
  }, [record, session, share])
}

export function reportLocal(session: Session, share: boolean, record: boolean): void {
  if (session.kind !== "device" || !session.deviceId) return
  void reportSelf(session, { actual: modeOf(share, record), adopt: true })
}
