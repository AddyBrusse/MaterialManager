import type { LaderGegevens, TeZagen } from '../../api/estimate'
import { ZAAG_STANDAARD, stukOpStang, stuksPerStang } from '../../api/estimate'
import './materiaal.css'

const nl = (n: number, d = 0) => n.toLocaleString('nl-NL', { maximumFractionDigits: d })
const HALF_VLAK = ZAAG_STANDAARD.vlakToeslag / 2

/**
 * Eén laderstang op schaal (2026-10-09): per stuk vlak · werkstuk · vlak ·
 * afsteek, dan het grijpstuk, en wat er tot de maximale laderlengte niet
 * gebruikt wordt. Elke lengte zijn eigen kleur.
 */
export function LaderStangBalk({ werkstukMm, lader, stuks, breedte = 520, legenda = true }: {
  werkstukMm: number
  lader: LaderGegevens
  /** Standaard een volle stang. */
  stuks?: number
  breedte?: number
  legenda?: boolean
}) {
  const stuk = stukOpStang(werkstukMm, lader)
  if (stuk <= 0) return <div className="mt-leeg">Vul een werkstuklengte in</div>
  const k = stuks ?? stuksPerStang(stuk, lader)
  const max = Math.max(lader.barloaderMaxMm, k * stuk + lader.opspanlengteMm)
  const S = breedte / max
  const delen: { x: number; w: number; c: string }[] = []
  let x = 0
  const zet = (w: number, c: string) => { delen.push({ x, w, c }); x += w }
  for (let i = 0; i < k; i++) {
    zet(HALF_VLAK, 'vl'); zet(werkstukMm, i % 2 ? 'wk2' : 'wk'); zet(HALF_VLAK, 'vl'); zet(lader.afsteekMm, 'af')
  }
  zet(lader.opspanlengteMm, 'gr')
  const over = lader.barloaderMaxMm - x
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((lader.barloaderMaxMm * f) / 50) * 50)
  return (
    <div className="mt-balk">
      <svg width={breedte} height={46} role="img" aria-label={`Laderstang ${nl(x)} mm met ${k} stuks`}>
        {delen.map((d, i) => <rect key={i} x={d.x * S} y={0} width={Math.max(0.6, d.w * S)} height={30} className={`mt-${d.c}`} />)}
        {over > 0 && <rect x={x * S} y={0} width={over * S} height={30} className="mt-rest-leeg" />}
        <line x1={lader.barloaderMaxMm * S - 0.5} x2={lader.barloaderMaxMm * S - 0.5} y1={-2} y2={32} className="mt-max" />
        {ticks.map((t, i) => (
          <text key={i} x={t * S} y={43} className="mt-tick" textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{nl(t)}</text>
        ))}
      </svg>
      {legenda && (
        <div className="mt-legenda">
          <span><i className="mt-wk" />werkstuk {nl(werkstukMm, 1)}</span>
          <span><i className="mt-vl" />vlak {nl(HALF_VLAK, 1)} + {nl(HALF_VLAK, 1)}</span>
          <span><i className="mt-af" />afsteek {nl(lader.afsteekMm, 1)}</span>
          <span><i className="mt-gr" />grijp {nl(lader.opspanlengteMm)}</span>
          {over > 0 && <span><i className="mt-rest-leeg" />niet gebruikt {nl(over)}</span>}
        </div>
      )}
    </div>
  )
}

/** Een voorraadstaaf met wat eruit gezaagd wordt en de rest (help kiezen). */
export function StaafBalk({ vrijMm, stangen, zaagsnedeMm, restWeg, restSchroot, schaalMm, breedte = 460 }: {
  vrijMm: number
  stangen: TeZagen[]
  zaagsnedeMm: number
  /** Rest afboeken aangevinkt. */
  restWeg: boolean
  restSchroot: boolean
  /** De langste staaf in beeld, zodat staven onderling te vergelijken zijn. */
  schaalMm: number
  breedte?: number
}) {
  const S = breedte / Math.max(1, schaalMm)
  let x = 0
  const delen: { x: number; w: number; c: string; t?: string }[] = []
  for (const s of stangen) {
    delen.push({ x, w: s.lengteMm, c: 'stang', t: s.lengteMm * S > 36 ? nl(s.lengteMm) : undefined }); x += s.lengteMm
    const z = Math.min(zaagsnedeMm, Math.max(0, vrijMm - x))
    if (z > 0) { delen.push({ x, w: z, c: 'zg' }); x += z }
  }
  const rest = Math.max(0, vrijMm - x)
  const restKlasse = restWeg || restSchroot ? 'schroot' : 'terug'
  return (
    <svg width={breedte} height={18} className="mt-staaf">
      {delen.map((d, i) => (
        <g key={i}>
          <rect x={d.x * S} y={0} width={Math.max(d.c === 'zg' ? 1.5 : 0.6, d.w * S)} height={18} className={`mt-${d.c}`} />
          {d.t && <text x={(d.x + d.w / 2) * S} y={12.5} className="mt-stang-t" textAnchor="middle">{d.t}</text>}
        </g>
      ))}
      {rest > 0 && <rect x={x * S} y={0} width={Math.max(2, rest * S)} height={18} className={`mt-${restKlasse}`} />}
    </svg>
  )
}
