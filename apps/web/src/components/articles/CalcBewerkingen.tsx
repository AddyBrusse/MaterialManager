import type { EstimateNode, EstimateStep } from '../../api/articles'
import type { Machine } from '../../api/machines'
import { machineMinutes, machineRatePerHour } from '../../api/estimate'
import { AcalcNum } from './AcalcNum'
import { Prullenbak, SectieKop, type CalcKit } from './calc-kit'
import { duurTekst, eur } from './calc-helpers'
import { Ic, Icon } from './calc-icons'

/**
 * De naam van een machineknoop is de naam van de máchine.
 *
 * Die naam reist mee naar de offerteregel (`bewerkingenVan`) en vandaar naar
 * de productiestap, waar de terminal en de planning hem moeten kunnen
 * herleiden tot een machine uit de lijst. Was hij vrij te typen, dan dreef
 * hij daarvan af en verdween het werk uit de wachtrij van de machine waar
 * het op staat. Hier tonen we dus wat er straks op de order komt te staan,
 * niet wat er ooit ingetypt is.
 */
const machineNaam = (node: EstimateNode, machines: Machine[]) =>
  (node.machineId ? machines.find(m => m.id === node.machineId)?.name : null) ?? node.name

/** Het tarief van de machine zelf (machine + operator), zonder wat er met de hand staat. */
const machineTarief = (node: EstimateNode, machines: Machine[]) => {
  const m = machines.find(x => x.id === node.machineId)
  return m ? m.machineRatePerHour + m.operatorRatePerHour : 0
}

/**
 * De sectie Bewerkingen: per machine (= één opspanning, en sinds 2026-10-23
 * één productiestap) de insteltijd en de bewerkingen met hun cyclustijd.
 *
 * Een uurtarief met de hand krijgt dezelfde "vast"-badge en weg terug als een
 * vaste materiaalprijs; voorheen zag je niet dat het tarief niet meer met de
 * machine meeging.
 */
export function CalcBewerkingen({ kit, nodes, total, machines, onBewerk, onStapErbij, onStap, onStapWeg, onMachineErbij }: {
  kit: CalcKit
  nodes: EstimateNode[]
  total: number
  machines: Machine[]
  onBewerk: (node: EstimateNode) => void
  onStapErbij: (machineNodeId: string) => void
  onStap: (machineNodeId: string, stepId: string, p: Partial<EstimateStep>) => void
  onStapWeg: (machineNode: EstimateNode, step: EstimateStep) => void
  onMachineErbij: () => void
}) {
  const { ctx } = kit
  return (
    <>
      <SectieKop kit={kit} id="g-bew" icon={Icon.tool} title="Bewerkingen" count={`${nodes.length} machines`} total={eur(total)} />
      {kit.isOpen('g-bew') && (
        <>
          {nodes.map(node => {
            const rate = machineRatePerHour(node, ctx)
            const totalMin = machineMinutes(node)
            const vast = node.rateOverride != null
            const aantal = (node.steps?.length ?? 0) + 1
            return (
              <div key={node.id}>
                <div className="acalc-mach-head" onDoubleClick={() => { if (!kit.readOnly) onBewerk(node) }} {...kit.rijProps(node)}>
                  <button type="button" className="acalc-chevron-btn" data-open={kit.isOpen(node.id)}
                    title="Klik om te openen · sleep om te ordenen" {...kit.sleepProps(node.id)}
                    onClick={e => { e.stopPropagation(); kit.toggle(node.id) }}><Ic d={Icon.chevronRight} size={14} /></button>
                  <input className="acalc-name-inp bold" value={machineNaam(node, machines)} readOnly
                    title="Dubbelklik om een andere machine te kiezen" onClick={e => e.stopPropagation()} />
                  <span className="acalc-stepsummary">{aantal} {aantal === 1 ? 'stap' : 'stappen'}</span>
                  <span className="acalc-num-muted">{duurTekst(totalMin)}</span>
                  <div className="acalc-mat-prijs" onDoubleClick={e => e.stopPropagation()}>
                    <AcalcNum value={rate} unit="€/u" width="w72" step={0.5} onChange={v => kit.updateNode(node.id, { rateOverride: v })} />
                    {vast && (
                      <div className="acalc-mat-vast">
                        <span className="acalc-vast-badge" title="Met de hand ingevuld: gaat niet mee als het tarief van de machine verandert">VAST TARIEF</span>
                        <button type="button" className="acalc-linkbtn" onClick={() => kit.updateNode(node.id, { rateOverride: null })}>
                          ↺ machine ({eur(machineTarief(node, machines))}/u)
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="acalc-total">{eur((totalMin / 60) * rate)}</span>
                  <div className="acalc-actions"><Prullenbak onDelete={() => kit.verwijder(node, 'Machine')} title="Machine verwijderen" /></div>
                </div>
                {kit.isOpen(node.id) && (
                  <>
                    <div className="acalc-step-row">
                      <span className="acalc-step-icon"><Ic d={Icon.clock} size={13} /></span>
                      <div className="acalc-step-main">
                        <span className="acalc-step-label">programmeren + opspannen</span>
                      </div>
                      <AcalcNum value={node.setupMin ?? 0} unit="min" width="w72" onChange={v => kit.updateNode(node.id, { setupMin: v })} />
                      <span className="acalc-typetag">Insteltijd</span>
                      <span className="acalc-total">{eur(((node.setupMin ?? 0) / 60) * rate)}</span>
                    </div>
                    {(node.steps ?? []).map(step => (
                      <div className="acalc-step-row" key={step.id}>
                        <span className="acalc-step-icon"><Ic d={Icon.bolt} size={13} /></span>
                        <div className="acalc-step-main">
                          <input className="acalc-note-inp" value={step.name} placeholder="Naam van de bewerking"
                            onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                            onChange={e => onStap(node.id, step.id, { name: e.target.value })} />
                        </div>
                        <AcalcNum value={step.cycleMin} unit="min" width="w72" step={0.5} onChange={v => onStap(node.id, step.id, { cycleMin: v })} />
                        <span className="acalc-typetag neutral">Verspaning</span>
                        <span className="acalc-total">{eur((step.cycleMin / 60) * rate)}</span>
                        <Prullenbak onDelete={() => onStapWeg(node, step)} title="Bewerking verwijderen" size={13} />
                      </div>
                    ))}
                    <div className="acalc-addrow indent">
                      <button type="button" className="acalc-addlink" onClick={() => onStapErbij(node.id)}><Ic d={Icon.plus} size={13} />Bewerking toevoegen</button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
          <div className="acalc-addrow">
            <button type="button" className="acalc-addlink" onClick={onMachineErbij}><Ic d={Icon.plus} size={13} />Machine toevoegen</button>
          </div>
        </>
      )}
    </>
  )
}
