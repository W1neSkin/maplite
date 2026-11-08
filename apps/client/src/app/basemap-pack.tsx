import { useEffect, useRef, useState } from "react"
import { t } from "../i18n/translate.js"
import { clearTiles, storeZip, tileCount } from "../map/tile-cache.js"
import { DownloadIcon, IconButton, ImportIcon, TrashIcon } from "./icons.js"

export function BasemapPack(props: { onSaveView: () => Promise<number> }) {
  const input = useRef<HTMLInputElement>(null)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void tileCount().then(setCount).catch(() => setCount(0))
  }, [])
  return (
    <div className="flex items-center gap-1">
      <IconButton tone="fill" aria-label={t("saveView")} title={t("saveView")} disabled={busy} onClick={() => {
        setBusy(true)
        void props.onSaveView().then(setCount).finally(() => setBusy(false))
      }}>
        <DownloadIcon />
      </IconButton>
      <IconButton tone="fill" aria-label={t("loadBasemap")} title={t("loadBasemap")} disabled={busy} onClick={() => input.current?.click()}>
        <ImportIcon />
      </IconButton>
      <span className="min-w-0 flex-1 truncate text-sm">{count > 0 ? t("offlineTiles", { count }) : t("loadBasemap")}</span>
      {count > 0 ? (
        <IconButton aria-label={t("clearBasemap")} title={t("clearBasemap")} onClick={() => { void clearTiles().then(() => setCount(0)) }}>
          <TrashIcon />
        </IconButton>
      ) : null}
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          setBusy(true)
          void file.arrayBuffer().then((buffer) => storeZip(new Uint8Array(buffer))).then(setCount).finally(() => setBusy(false))
        }}
      />
    </div>
  )
}
