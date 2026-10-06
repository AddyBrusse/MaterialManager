import type { Cel } from '@stockmanager/shared'
import { datum, eur } from './bestel-tekst'

/** Eén leverancier bij één regel in de vergelijking (2026-10-06). */
export function VergelijkCel({ cel, goedkoopst, gekozen, bezig, onKies, onWis, onAntwoord }: {
  cel: Cel
  goedkoopst: boolean
  gekozen: boolean
  bezig: boolean
  onKies: () => void
  onWis: () => void
  onAntwoord: (aanvraagId: string) => void
}) {
  if (cel.soort === 'geen') return <div className="bs-cel leeg">niet gekoppeld</div>
  if (cel.soort === 'gevraagd') {
    return (
      <div className="bs-cel leeg">
        <div>—</div>
        <div className="bs-sub">gevraagd in {cel.aanvraagId}, nog geen antwoord</div>
        <button type="button" className="st-btn sm" onClick={() => onAntwoord(cel.aanvraagId)}>Antwoord invullen</button>
      </div>
    )
  }
  const herkomst = cel.bron === 'antwoord' ? `antwoord ${cel.aanvraagId}` : `prijslijst van ${datum(cel.datum)}`
  return (
    <div className="bs-cel" data-gekozen={gekozen}>
      <div className="bs-cel-prijs">
        <span className="cell-mono">{eur(cel.totaal)}</span>
        {goedkoopst && <span className="bs-goedkoopst">GOEDKOOPST</span>}
      </div>
      <div className="bs-sub">{cel.uitleg}</div>
      <div className="bs-sub">{cel.levertijdDagen != null ? `levertijd ${cel.levertijdDagen} werkdag${cel.levertijdDagen === 1 ? '' : 'en'}` : 'levertijd onbekend'} · {herkomst}</div>
      <div className="bs-cel-acties">
        {gekozen
          ? <><span className="bs-gekozen">✓ Gekozen</span><button type="button" className="acalc-linkbtn" disabled={bezig} onClick={onWis}>wissen</button></>
          : <button type="button" className="st-btn sm" disabled={bezig} onClick={onKies}>Kies</button>}
        {cel.bron === 'antwoord' && cel.aanvraagId && <button type="button" className="acalc-linkbtn" onClick={() => onAntwoord(cel.aanvraagId!)}>antwoord wijzigen</button>}
      </div>
    </div>
  )
}
