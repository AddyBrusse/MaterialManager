import type { ReactNode } from 'react'
import type { EstimateNode } from '../../api/articles'
import type { BrutoOpbouw } from '../../api/estimate'
import type { Machine } from '../../api/machines'
import { LaderStangBalk } from '../materiaal/Balken'
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
  /** Om de draaibank met lader te kiezen. */
  machines: Machine[]
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
 *
 * Geen aantal (2026-10-09): het recept is voor één stuk, het aantal komt uit
 * de offerte. Wel per regel de stangenlader aan of uit, met de machine.
 */
export function MateriaalRegel(p: Props) {
  const { node, bruto, voorraad, berekend } = p
  const vast = node.costOverride != null
  const prijs = vast ? node.costOverride! : berekend
  const metLader = p.machines.filter((m) => m.heeftStangenlader)
  const opbouw = bruto.lader
    ? `${bruto.stuksPerLaderstang} st per laderstang van ${mm(bruto.laderstangMm ?? 0)} · +${bruto.vlakMm} vlak · +${bruto.afsteekMm} afsteek · grijp ${bruto.lader.opspanlengteMm} en zaagsnede per stang`
    : `+${bruto.vlakMm} vlak · +${bruto.zaagsnedeMm} zaag · alleen lengte`

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
          <div className="acalc-mat-opbouw">{opbouw}</div>
        )}
        {bruto.lader && bruto.nettoMm > 0 && (
          <LaderStangBalk werkstukMm={bruto.nettoMm} lader={bruto.lader} breedte={300} legenda={false} />
        )}
      </div>
      <div className="acalc-mat-lader" onDoubleClick={(e) => e.stopPropagation()}>
        <label title={metLader.length === 0 ? 'Geen machine met stangenlader (Instellingen → Machines)' : undefined}>
          <input type="checkbox" checked={!!node.laderMachineId} disabled={metLader.length === 0 || node.exoot}
            onChange={(e) => p.onWijzig({ laderMachineId: e.currentTarget.checked ? metLader[0]?.id ?? null : null })} />
          {node.laderMachineId ? 'aan' : 'uit'}
        </label>
        {node.laderMachineId && (
          <select value={node.laderMachineId} onChange={(e) => p.onWijzig({ laderMachineId: e.currentTarget.value })}>
            {metLader.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>
      <div className={`acalc-mat-voorraad ${voorraad.vrijMm == null ? 'onbekend' : voorraad.vrijMm >= bruto.brutoMm && voorraad.vrijMm > 0 ? 'ok' : 'tekort'}`}>
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
      <span className="acalc-total">{eur(prijs)}</span>
      {p.acties}
    </div>
  )
}
