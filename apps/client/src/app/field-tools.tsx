import { t } from "../i18n/translate.js"
import { GeometryGlyph, IconButton, LocateIcon, PinIcon } from "./icons.js"

export function FieldTools(props: { busy: boolean; onMark: () => void; onAverage: () => void; onLine: () => void; onPolygon: () => void }) {
  return (
    <div className="mb-1 flex gap-1">
      <IconButton tone="fill" aria-label={t("markHere")} title={t("markHere")} disabled={props.busy} onClick={props.onMark}><PinIcon /></IconButton>
      <IconButton tone="fill" aria-label={props.busy ? t("averaging") : t("averageHere")} title={props.busy ? t("averaging") : t("averageHere")} disabled={props.busy} onClick={props.onAverage}><LocateIcon /></IconButton>
      <IconButton tone="fill" aria-label={t("buildLine")} title={t("buildLine")} disabled={props.busy} onClick={props.onLine}><GeometryGlyph type="LineString" /></IconButton>
      <IconButton tone="fill" aria-label={t("buildPolygon")} title={t("buildPolygon")} disabled={props.busy} onClick={props.onPolygon}><GeometryGlyph type="Polygon" /></IconButton>
    </div>
  )
}
