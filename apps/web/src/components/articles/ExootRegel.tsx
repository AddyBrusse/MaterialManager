import type { ReactNode } from 'react'
import type { EstimateNode } from '../../api/articles'
import { stuksUitEen } from '../../api/estimate'
import { AcalcNum } from './AcalcNum'
import { ExootLabel } from '../inkoop/ExootLabel'

const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Props {
  node: EstimateNode
  naam: ReactNode
  notitie: ReactNode
  acties: ReactNode
  handvat: ReactNode
  klant: { naam: string } | null
  /** Per werkstuk zonder vaste prijs: gewicht exoot × €/kg ÷ stuks uit één. */
  berekend: number
  onWijzig: (p: Partial<EstimateNode>) => void
  rijProps: Record<string, unknown>
}

/** "½", "⅓", "¼" of "1/5": het deel van één exoot dat een werkstuk kost. */
export function deelTekst(aantal: number, n: number): string {
  if (n === 1) return `${aantal}`
  const breuk: Record<number, string> = { 2: '½', 3: '⅓', 4: '¼' }
  return aantal === 1 && breuk[n] ? breuk[n] : `${aantal}/${n}`
}

/**
 * Een exoot in de calculator (2026-10-06): op maat geleverd, dus geen netto →
 * bruto. In plaats daarvan het aantal werkstukken uit één exoot.
 */
export function ExootRegel(p: Props) {
  const { node, berekend } = p
  const aantal = node.qty ?? 1
  const n = stuksUitEen(node)
  const vast = node.costOverride != null
  const prijs = vast ? node.costOverride! : berekend
  return (
    <div className="acalc-mat-row mat" {...p.rijProps}>
      {p.handvat}
      <div className="acalc-mat-naam">
        {p.naam}
        {p.notitie}
      </div>
      <div className="acalc-mat-lengte">
        <div className="acalc-mat-lengte-rij">
          <ExootLabel klant={p.klant} compact />
          <span className="acalc-unit">op maat geleverd ·</span>
          <AcalcNum value={n} width="w56" onChange={(v) => p.onWijzig({ stuksUitEen: Math.max(1, Math.floor(v || 1)) })} />
          <span className="acalc-unit">stuks uit 1 exoot</span>
        </div>
        <div className="acalc-mat-opbouw">
          {node.lengthMm ? `${node.lengthMm.toLocaleString('nl-NL')} mm lang · geen zaagsnede of lader` : 'geen lengte'}
          {p.klant ? ` · voor ${p.klant.naam}` : ''}
        </div>
      </div>
      <div>
        <AcalcNum value={aantal} unit="st" width="w56" onChange={(v) => p.onWijzig({ qty: v })} />
        <div className="acalc-mat-opbouw">{deelTekst(aantal, n)} exoot</div>
      </div>
      <div className="acalc-mat-voorraad exoot">bestellen bij opdracht</div>
      <div className="acalc-mat-prijs">
        <AcalcNum value={Number(prijs.toFixed(2))} unit="€" unitBefore width="w72" step={0.01} onChange={(v) => p.onWijzig({ costOverride: v })} />
        {vast && (
          <div className="acalc-mat-vast">
            <span className="acalc-vast-badge" title="Met de hand ingevuld: rekent niet mee met maat of €/kg">VASTE PRIJS</span>
            <button type="button" className="acalc-linkbtn" onClick={() => p.onWijzig({ costOverride: null })}>↺ berekend ({eur(berekend)})</button>
          </div>
        )}
      </div>
      <span className="acalc-total">{eur(aantal * prijs)}</span>
      {p.acties}
    </div>
  )
}
