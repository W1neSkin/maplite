import { forwardRef, useEffect, useState, type FormEvent, type ReactNode } from "react"
import { t } from "../i18n/translate.js"
import { CheckIcon, CloseIcon, IconButton, PencilIcon } from "./icons.js"

type SheetProps = {
  title: string
  onClose: () => void
  onRename?: (name: string) => void
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

/** Floating sheet. The title is the only copy of the name; the pencil edits that title. */
export const Sheet = forwardRef<HTMLElement, SheetProps>(function Sheet(props, ref) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.title)
  useEffect(() => {
    setDraft(props.title)
    setEditing(false)
  }, [props.title])

  function cancel() {
    setDraft(props.title)
    setEditing(false)
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const name = draft.trim()
    if (name && name !== props.title) props.onRename?.(name)
    setEditing(false)
  }

  return (
    <section ref={ref} className="pointer-events-auto absolute inset-x-3 bottom-[calc(84px+max(8px,env(safe-area-inset-bottom)))] z-20 flex max-h-[min(20rem,46%)] flex-col overflow-hidden rounded-2xl border border-black/10 bg-[var(--card)] text-[var(--foreground)] shadow-lg">
      <header className="flex shrink-0 items-center gap-1 px-2 py-1">
        {editing ? (
          <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={save}>
            <input
              aria-label={t("featureName")}
              className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-2 text-sm"
              value={draft}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") cancel()
              }}
            />
            <IconButton tone="accent" type="submit" aria-label={t("saveFeature")} title={t("saveFeature")} disabled={!draft.trim()}>
              <CheckIcon />
            </IconButton>
            <IconButton tone="fill" aria-label={t("cancel")} title={t("cancel")} onClick={cancel}>
              <CloseIcon />
            </IconButton>
          </form>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{props.title}</h2>
            {props.onRename ? (
              <IconButton tone="fill" aria-label={t("rename")} title={t("rename")} onClick={() => { setDraft(props.title); setEditing(true) }}>
                <PencilIcon />
              </IconButton>
            ) : null}
            {props.actions}
            <IconButton tone="fill" aria-label={t("close")} title={t("close")} onClick={props.onClose}>
              <CloseIcon />
            </IconButton>
          </>
        )}
      </header>
      <div data-sheet-body="" className={`min-h-0 overflow-auto px-2 ${props.footer ? "pb-1" : "pb-2"}`}>{props.children}</div>
      {props.footer ? <div className="flex shrink-0 gap-1 border-t border-[var(--border)] px-2 py-2">{props.footer}</div> : null}
    </section>
  )
})
