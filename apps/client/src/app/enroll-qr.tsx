import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { t } from "../i18n/translate.js"

/** The long code stays inside the picture. Nobody has to type it. */
export function EnrollQr(props: { text: string }) {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    let cancel = false
    void QRCode.toDataURL(props.text, { width: 220, margin: 1 }).then((url) => {
      if (!cancel) setImage(url)
    })
    return () => {
      cancel = true
    }
  }, [props.text])
  if (!image) return null
  return <img alt={t("enrollmentQr")} className="h-44 w-44 rounded-lg bg-white" src={image} />
}
