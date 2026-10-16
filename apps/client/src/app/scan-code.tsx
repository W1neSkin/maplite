import { useEffect, useRef, useState } from "react"
import { t } from "../i18n/translate.js"
import { readEnrollment } from "./enrollment.js"
import { CloseIcon, IconButton } from "./icons.js"

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]> }

function openDetector(): Detector | null {
  const BarcodeDetector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector
  if (!BarcodeDetector) return null
  return new BarcodeDetector({ formats: ["qr_code"] })
}

/** Rear camera. Stops as soon as one enrollment picture is read. */
export function ScanCode(props: { onCode: (code: string, serverUrl: string | null) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onCode = useRef(props.onCode)
  onCode.current = props.onCode
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const detector = openDetector()
    const video = videoRef.current
    if (!detector || !video || !navigator.mediaDevices) {
      setFailed(true)
      return
    }
    let stop = false
    let stream: MediaStream | null = null
    void (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        if (stop) {
          media.getTracks().forEach((track) => track.stop())
          return
        }
        stream = media
        video.srcObject = media
        // Android WebView drops the CSS height when the stream attaches unless these are set in script.
        video.muted = true
        video.setAttribute("playsinline", "true")
        video.setAttribute("webkit-playsinline", "true")
        await video.play()
        const look = () => {
          if (stop) return
          void detector.detect(video).then((codes) => {
            const raw = codes[0]?.rawValue
            if (!raw) {
              if (!stop) requestAnimationFrame(look)
              return
            }
            const read = readEnrollment(raw)
            if (!read.code) {
              if (!stop) requestAnimationFrame(look)
              return
            }
            stop = true
            stream?.getTracks().forEach((track) => track.stop())
            onCode.current(read.code, read.serverUrl)
          }).catch(() => {
            if (!stop) requestAnimationFrame(look)
          })
        }
        look()
      } catch {
        if (!stop) setFailed(true)
      }
    })()
    return () => {
      stop = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center">
        <span className="min-w-0 flex-1 truncate text-sm">{failed ? t("scanFailed") : t("scanCode")}</span>
        <IconButton aria-label={t("close")} title={t("close")} onClick={props.onClose}><CloseIcon /></IconButton>
      </div>
      {failed ? null : (
        <div className="relative h-64 w-full shrink-0 overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay muted playsInline />
        </div>
      )}
    </div>
  )
}
