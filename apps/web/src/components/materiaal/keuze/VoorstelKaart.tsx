import type { Voorstel } from '../../../api/materiaal-plan'
import { stangenTekst } from '../../../api/materiaal-plan'
import { StaafBalk } from '../Balken'

const nl = (n: number) => Math.round(n).toLocaleString('nl-NL')

/** "2 staven op · 1 rest terug" — de stand van een voorstel in één regel. */
function stand(v: Voorstel, weg: Set<string>): string {
  const op = v.regels.filter((r) => r.restWordtSchroot || weg.has(r.barId)).length
  const terug = v.regels.length - op
  return [
    `${op} ${op === 1 ? 'staaf' : 'staven'} helemaal op`,
    terug > 0 ? `${terug} ${terug === 1 ? 'rest' : 'resten'} terug in het rek` : null,
    v.tekortStuks > 0 ? `${v.tekortStuks} st tekort` : null,
  ].filter(Boolean).join(' · ')
}

/**
 * Eén voorstel: per staaf wat eruit gezaagd wordt, op schaal, en wat er
 * overblijft. Blijft er een rest over, dan kan die hier meteen afgeboekt
 * worden (afgesproken 2026-10-09) — of een rest bruikbaar is beslist de mens.
 */
export function VoorstelKaart({ v, letter, gekozen, weg, schaalMm, zaagsnedeMm, onKies, onWeg }: {
  v: Voorstel
  letter: string
  gekozen: boolean
  /** Staven waarvan de rest afgeboekt wordt. */
  weg: Set<string>
  schaalMm: number
  zaagsnedeMm: number
  onKies: () => void
  onWeg: (barId: string, aan: boolean) => void
}) {
  return (
    <div className="hk-voorstel" data-gekozen={gekozen || undefined} onClick={onKies} role="button" aria-pressed={gekozen}>
      <div className="titel">
        <span className={`mk-tag${gekozen ? ' gekozen' : ''}`}>{letter}{letter === 'A' ? ' · beste' : ''}</span>
        <b>{v.regels.length === 0 ? 'Niets op voorraad' : `${v.regels.length} ${v.regels.length === 1 ? 'staaf' : 'staven'}`}</b>
        <span className="stand">{stand(v, weg)}</span>
      </div>
      <div className="hk-regels">
        {v.regels.map((r) => {
          const restWeg = weg.has(r.barId)
          return (
            <div key={r.barId} style={{ display: 'contents' }}>
              <span className="code" title={r.locatie ?? undefined}>{r.barCode} <span className="k">{nl(r.vrijMm)}</span></span>
              <span className="k" title={stangenTekst(r.stangen)}>{stangenTekst(r.stangen)}</span>
              <StaafBalk vrijMm={r.vrijMm} stangen={r.stangen} zaagsnedeMm={zaagsnedeMm}
                restWeg={restWeg} restSchroot={r.restWordtSchroot} schaalMm={schaalMm} breedte={290} />
              <span className="rest" onClick={(e) => e.stopPropagation()}>
                {r.restWordtSchroot ? (
                  r.restMm > 0 ? `${nl(r.restMm)} mm schroot · staaf op` : 'staaf op'
                ) : (
                  <label title="Bij het afboeken gaat de rest mee als schroot; de hele vrije lengte wordt nu al vastgelegd">
                    <input type="checkbox" checked={restWeg} onChange={(e) => onWeg(r.barId, e.currentTarget.checked)} />
                    rest {nl(r.restMm)} mm afboeken
                  </label>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {v.tekortStuks > 0 && (
        <div className="hk-tekort" style={{ marginTop: 6 }}>
          {v.tekortStuks} stuks tekort: nog {stangenTekst(v.tekortStangen)} nodig. Vastleggen reserveert wat er ligt en zet het tekort op de bestellijst.
        </div>
      )}
    </div>
  )
}
