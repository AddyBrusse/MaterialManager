import type { EstimateNode } from '../../api/articles'
import { AcalcNum } from './AcalcNum'
import { SectieKop, type CalcKit } from './calc-kit'
import { eur } from './calc-helpers'
import { Ic, Icon } from './calc-icons'

/** De sectie Uitbestedingen: dienst, omschrijving, aantal en prijs per stuk. */
export function CalcUitbestedingen({ kit, nodes, total, onBewerk, onErbij }: {
  kit: CalcKit
  nodes: EstimateNode[]
  total: number
  onBewerk: (node: EstimateNode) => void
  onErbij: () => void
}) {
  return (
    <>
      <SectieKop kit={kit} id="g-uit" icon={Icon.truck} title="Uitbestedingen" count={`${nodes.length} regels`} total={eur(total)} />
      {kit.isOpen('g-uit') && (
        <>
          <div className="acalc-mat-head acalc-colhead">
            <span />
            <span className="nudge-name">Dienst</span>
            <span className="nudge-note">Omschrijving</span>
            <span className="nudge-aantal">Aantal</span>
            <span className="nudge-prijs">Prijs/st</span>
            <span className="ta-r">Totaal</span>
            <span />
          </div>
          {nodes.map(node => {
            const aantal = node.qty ?? 1
            const prijs = node.externalCost ?? 0
            return (
              <div className="acalc-mat-row" key={node.id} onDoubleClick={() => { if (!kit.readOnly) onBewerk(node) }} {...kit.rijProps(node)}>
                {kit.handvat(node.id)}
                {kit.naamVeld(node.id, node.name, v => kit.updateNode(node.id, { name: v }))}
                <input className="acalc-note-inp" value={node.note ?? ''}
                  onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                  onChange={e => kit.updateNode(node.id, { note: e.target.value })} />
                <AcalcNum value={aantal} unit="st" width="w56" onChange={v => kit.updateNode(node.id, { qty: v })} />
                <AcalcNum value={prijs} unit="€" unitBefore width="w72" step={0.01} onChange={v => kit.updateNode(node.id, { externalCost: v })} />
                <span className="acalc-total">{eur(aantal * prijs)}</span>
                {kit.rijActies(node.id, () => kit.verwijder(node, 'Uitbesteding'), 'Uitbesteding verwijderen')}
              </div>
            )
          })}
          <div className="acalc-addrow" style={{ borderBottom: 0 }}>
            <button type="button" className="acalc-addlink" onClick={onErbij}><Ic d={Icon.plus} size={13} />Uitbesteding toevoegen</button>
          </div>
        </>
      )}
    </>
  )
}
