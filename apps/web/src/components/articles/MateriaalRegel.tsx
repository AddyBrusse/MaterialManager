import type { ReactNode } from 'react'
import type { EstimateNode } from '../../api/articles'
import type { BrutoOpbouw } from '../../api/estimate'
import { AcalcNum } from './AcalcNum'

const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const mm = (n: number) => `${n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mm`

export interface VoorraadStand {
  /** Vrije mm over alle staven van deze kwaliteit, vorm en maat; null = staat niet in de materiaallijst. */
  vrijMm: number | null
}

interface Props {
  node: EstimateNode
  naam: ReactNode
  notitie: ReactNode
  acties: ReactNode
  handvat: ReactNode
  bruto: BrutoOpbouw
  voorraad: VoorraadStand
  /** Wat de regel kost zonder vaste prijs: bruto gewicht × €/kg. */
  berekend: number
  onWijzig: (p: Partial<EstimateNode>) => void
  onBewerk: () => void
  rijProps: Record<string, unknown>
}

/**
 * Eén materiaalregel in de calculator (2026-10-06): netto lengte om in te
 * vullen, de bruto lengte waarmee gerekend wordt ernaast, de vrije voorraad,
 * en de prijs — met een duidelijke "vaste prijs" als iemand hem met de hand
 * invulde, en een weg terug naar de berekende.
 */
export function MateriaalRegel(p: Props) {
  const { node, bruto, voorraad, berekend } = p
  const aantal = node.qty ?? 1
  const vast = node.costOverride != null
  const prijs = vast ? node.costOverride! : berekend
  const opbouw = [
    `+${bruto.vlakMm} vlak`,
    bruto.afsteekMm ? `+${bruto.afsteekMm} afsteek` : null,
    `+${bruto.zaagsnedeMm} zaag`,
    bruto.lader ? `+${bruto.opspanPerStukMm.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} opspan (${bruto.lader.opspanlengteMm} mm / ${bruto.stuksPerLaderstang} st per laderstang)` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="acalc-mat-row mat" onDoubleClick={p.onBewerk} {...p.rijProps}>
      {p.handvat}
      <div className="acalc-mat-naam">
        {p.naam}
        {p.notitie}
      </div>
      <div className="acalc-mat-lengte" onDoubleClick={(e) => e.stopPropagation()}>
        <div className="acalc-mat-lengte-rij">
          <AcalcNum value={bruto.nettoMm} width="w72" unit="mm" onChange={(v) => p.onWijzig({ lengthMm: v || null })} />
          <span className="acalc-unit">netto</span>
          {bruto.nettoMm > 0 && <span className="acalc-mat-bruto">→ {mm(bruto.brutoMm)} bruto</span>}
        </div>
        {bruto.nettoMm > 0 && (
          <div className="acalc-mat-opbouw" title={bruto.lader ? `Draaibank met lader: ${bruto.lader.machineNaam}` : 'Geen draaibank met lader in de bewerkingen'}>
            {opbouw}{bruto.lader ? ` · ${bruto.lader.machineNaam}` : ' · geen lader'}
          </div>
        )}
      </div>
      <div onDoubleClick={(e) => e.stopPropagation()}>
        <AcalcNum value={aantal} unit="st" width="w56" onChange={(v) => p.onWijzig({ qty: v })} />
      </div>
      <div className={`acalc-mat-voorraad ${voorraad.vrijMm == null ? 'onbekend' : voorraad.vrijMm >= bruto.brutoMm * aantal && voorraad.vrijMm > 0 ? 'ok' : 'tekort'}`}>
        {voorraad.vrijMm == null ? 'niet in lijst' : voorraad.vrijMm > 0 ? `vrij ${mm(voorraad.vrijMm)}` : 'niet op voorraad'}
      </div>
      <div className="acalc-mat-prijs" onDoubleClick={(e) => e.stopPropagation()}>
        <AcalcNum value={Number(prijs.toFixed(2))} unit="€" unitBefore width="w72" step={0.01} onChange={(v) => p.onWijzig({ costOverride: v })} />
        {vast && (
          <div className="acalc-mat-vast">
            <span className="acalc-vast-badge" title="Met de hand ingevuld: rekent niet mee met lengte of €/kg">VASTE PRIJS</span>
            <button type="button" className="acalc-linkbtn" onClick={() => p.onWijzig({ costOverride: null })}>
              ↺ berekend ({eur(berekend)})
            </button>
          </div>
        )}
      </div>
      <span className="acalc-total">{eur(aantal * prijs)}</span>
      {p.acties}
    </div>
  )
}
