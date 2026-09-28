import { useState } from 'react'
import type { Offerte } from '@stockmanager/shared'
import { eur } from '../lib/format'

interface Props {
  offerte: Offerte
  /** Vooringevuld: de referentie van het project, als die er is. */
  start: string
  onAccepteer: (opdrachtRef: string | null) => void
  onSluit: () => void
}

/**
 * De vraag vóór een offerte opdracht wordt — met de opdrachtreferentie erbij,
 * want dit is het moment dat je hem weet (besloten 2026-09-28): het
 * inkoopnummer uit de mail, of "WhatsApp J. Prins 28-09".
 *
 * Leeg laten mag: hij is pas verplicht bij het versturen van de
 * opdrachtbevestiging, en dan zegt de melding het.
 */
export function AccepteerVenster({ offerte: o, start, onAccepteer, onSluit }: Props) {
  const [ref, setRef] = useState(start)
  const totaal = o.regels.reduce((s, r) => s + r.totaal, 0)
  const titel = o.direct ? 'Opdracht maken' : `v${o.versie} accepteren`
  return (
    <div role="dialog" aria-modal="true" aria-label={titel} className="pdv2-modal-achter" onClick={onSluit}>
      <div className="pdv2-card pdv2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pdv2-card-head">
          <h2>{titel}</h2>
        </div>
        <div className="pdv2-card-body pdv2-modal-tekst">
          <p>
            {o.direct ? 'De directe opdracht' : <>Offerte <strong>{o.documentNr} v{o.versie}</strong></>} met{' '}
            {o.regels.length} regel{o.regels.length === 1 ? '' : 's'} ({eur(totaal)}) wordt de opdracht. Er
            komen {o.regels.length} productieorder{o.regels.length === 1 ? '' : 's'} en per regel een todo om het
            materiaal te kiezen.
          </p>
          {!o.direct && <p>Andere versies die nog openstonden, vervallen.</p>}
          <div className="pdv2-veld">
            <label htmlFor="acc-ref">Opdrachtreferentie</label>
            <input
              id="acc-ref"
              autoFocus
              maxLength={200}
              value={ref}
              placeholder="inkoopnummer, of mail/WhatsApp + datum"
              onChange={(e) => setRef(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAccepteer(ref.trim() || null)}
            />
            <div className="hint">Waarmee de klant opdracht gaf. Mag nu leeg; nodig om de opdrachtbevestiging te versturen.</div>
          </div>
        </div>
        <div className="pdv2-modal-knoppen">
          <button type="button" className="pdv2-btn" onClick={onSluit}>
            Annuleren
          </button>
          <button type="button" className="pdv2-btn primair" onClick={() => onAccepteer(ref.trim() || null)}>
            {o.direct ? 'Opdracht maken' : 'Accepteren'}
          </button>
        </div>
      </div>
    </div>
  )
}
