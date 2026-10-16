import type { ButtonHTMLAttributes, ReactNode } from "react"

type Tone = "ghost" | "fill" | "accent" | "inverse" | "dock" | "dockOn"

const toneClass: Record<Tone, string> = {
  ghost: "text-[var(--foreground)]",
  fill: "bg-black/5 text-[var(--foreground)]",
  accent: "bg-[var(--primary)] text-white",
  inverse: "bg-white/15 text-white",
  dock: "border border-black/10 bg-white text-[var(--foreground)] shadow-lg",
  dockOn: "bg-[var(--primary)] text-white shadow-lg",
}

export function IconButton({ tone = "ghost", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type={type}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-40 ${toneClass[tone]} ${className}`}
      {...props}
    />
  )
}

function Glyph(props: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {props.children}
    </svg>
  )
}

export function PencilIcon() {
  return (
    <Glyph>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Glyph>
  )
}

export function TrashIcon() {
  return (
    <Glyph>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
    </Glyph>
  )
}

export function CheckIcon() {
  return (
    <Glyph>
      <path d="m5 12 5 5L20 7" />
    </Glyph>
  )
}

export function CloseIcon() {
  return (
    <Glyph>
      <path d="M6 6l12 12M18 6 6 18" />
    </Glyph>
  )
}

export function PlusIcon() {
  return (
    <Glyph>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  )
}

export function EyeIcon() {
  return (
    <Glyph>
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </Glyph>
  )
}

export function EyeOffIcon() {
  return (
    <Glyph>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a18 18 0 0 1-3.2 3.8" />
      <path d="M6.1 6.1C3.5 8 2 12 2 12a18 18 0 0 0 6.2 5.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Glyph>
  )
}

export function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <g fill="currentColor">
        <circle cx="9" cy="7" r="1.3" />
        <circle cx="15" cy="7" r="1.3" />
        <circle cx="9" cy="12" r="1.3" />
        <circle cx="15" cy="12" r="1.3" />
        <circle cx="9" cy="17" r="1.3" />
        <circle cx="15" cy="17" r="1.3" />
      </g>
    </svg>
  )
}

export function LocateIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </Glyph>
  )
}

export function PinIcon() {
  return (
    <Glyph>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.2" />
    </Glyph>
  )
}

export function LayersIcon() {
  return (
    <Glyph>
      <path d="m12 3 9 5-9 5L3 8l9-5z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </Glyph>
  )
}

export function SyncIcon() {
  return (
    <Glyph>
      <path d="M21 12a9 9 0 0 0-15-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 15 6.7L21 16" />
      <path d="M21 21v-5h-5" />
    </Glyph>
  )
}

export function BackIcon() {
  return (
    <Glyph>
      <path d="m15 18-6-6 6-6" />
    </Glyph>
  )
}

export function DisconnectIcon() {
  return (
    <Glyph>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Glyph>
  )
}

type GeometryKind = "Point" | "LineString" | "Polygon"

export function GeometryGlyph(props: { type: GeometryKind }) {
  if (props.type === "Point") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="shrink-0 text-neutral-500">
        <circle cx="8" cy="8" r="3.2" fill="currentColor" />
      </svg>
    )
  }
  if (props.type === "LineString") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="shrink-0 text-neutral-500">
        <path d="M2 12 6 6l4 4 4-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="shrink-0 text-neutral-500">
      <path d="M4 5.5 12 4l1.2 7.2L5 13Z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}
