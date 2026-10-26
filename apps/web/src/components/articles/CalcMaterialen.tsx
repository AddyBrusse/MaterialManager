import type { EstimateNode } from '../../api/articles'
import type { Grade } from '@stockmanager/shared'
import type { Machine } from '../../api/machines'
import { computeWeightKg, formatDimensions, type ProfileInfo, type RawMaterialRow } from '../../api/raw-materials'
import { brutoLengte, laderVoorRegel, materialCostPerPiece, nettoLengte, type EstimateCtx } from '../../api/estimate'
import { MateriaalRegel, type VoorraadStand } from './MateriaalRegel'
import { ExootRegel } from './ExootRegel'
import { SectieKop, type CalcKit } from './calc-kit'
import { dimsKey, eur, num } from './calc-helpers'
import { Ic, Icon } from './calc-icons'

/** "Ø50 · 4,62 kg bruto · € 1,85/kg" — maat, gewicht over de bruto lengte (2026-10-06) en €/kg. */
function materialSpec(node: EstimateNode, ctx: EstimateCtx, grades: Grade[], profiles: ProfileInfo[]): string {
  const g = grades.find(x => x.id === node.gradeId)
  if (!g) return '—'
  const nodeProfile = node.profileId ? profiles.find(p => p.id === node.profileId) : undefined
  const formula = (nodeProfile?.volumeFormula ?? ctx.profileFormula) as ProfileInfo['volumeFormula'] | undefined
  const dims = node.dimensions && Object.keys(node.dimensions).length > 0 ? node.dimensions : ctx.recipe?.dimensions
  // Een exoot komt op maat: zijn eigen lengte, geen zaagsnede of lader.
  const len = node.exoot ? (node.lengthMm ?? 0) : brutoLengte(nettoLengte(node, ctx), laderVoorRegel(node, ctx.machines)).brutoMm
  const priceStr = `${eur(g.pricePerKg ?? 0)}/kg`
  if (!formula || !dims) return `0 kg · ${priceStr}`
  const kg = computeWeightKg(formula, dims, len, g.densityKgM3)
  const dimProfile = nodeProfile ?? (ctx.recipe?.profileId ? profiles.find(p => p.id === ctx.recipe!.profileId) : undefined)
  const dimStr = dimProfile ? formatDimensions(dimProfile, dims) : ''
  return `${dimStr} · ${num(kg)} kg${node.exoot ? ' per exoot' : ' bruto'} · ${priceStr}`
}

/** Vrije mm van deze kwaliteit, vorm en maat, over alle staven samen. */
function voorraadVan(node: EstimateNode, stockRows: RawMaterialRow[]): VoorraadStand {
  if (!node.gradeId || !node.profileId || !node.dimensions) return { vrijMm: null }
  const key = dimsKey(node.dimensions)
  const rijen = stockRows.filter(r => r.gradeId === node.gradeId && r.profileId === node.profileId && dimsKey(r.dimensions) === key)
  if (rijen.length === 0) return { vrijMm: null }
  return { vrijMm: rijen.reduce((t, r) => t + Math.max(0, Number(r.vrijMm) || 0), 0) }
}

/**
 * De sectie Materialen: per regel netto → bruto, stangenlader, voorraad en
 * prijs; een exoot met zijn eigen maat. Dubbelklik op een regel opent dezelfde
 * materiaalkiezer als "Materiaal kiezen" (2026-10-23), met die regel al
 * aangeklikt — er was nog een oud venster met keuzelijsten zonder lader.
 */
export function CalcMaterialen({ kit, nodes, total, grades, profiles, machines, stockRows, onWijzigMateriaal, onKies, onExoot }: {
  kit: CalcKit
  nodes: EstimateNode[]
  total: number
  grades: Grade[]
  profiles: ProfileInfo[]
  machines: Machine[]
  stockRows: RawMaterialRow[]
  onWijzigMateriaal: (node: EstimateNode) => void
  onKies: () => void
  onExoot: () => void
}) {
  const { ctx } = kit
  const notitie = (node: EstimateNode) => (
    <input className="acalc-note-inp klein" value={node.note ?? ''}
      placeholder={materialSpec(node, ctx, grades, profiles)}
      onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      onChange={e => kit.updateNode(node.id, { note: e.target.value })} />
  )
  return (
    <>
      <SectieKop kit={kit} id="g-mat" icon={Icon.layers} title="Materialen" count={`${nodes.length} regels`} total={eur(total)} />
      {kit.isOpen('g-mat') && (
        <>
          <div className="acalc-mat-head mat acalc-colhead">
            <span />
            <span className="nudge-name">Materiaal</span>
            <span>Lengte per stuk</span>
            <span>Stangenlader</span>
            <span>Voorraad</span>
            <span>Prijs</span>
            <span className="ta-r">Totaalprijs</span>
            <span />
          </div>
          {nodes.map(node => node.exoot ? (
            <ExootRegel
              key={node.id}
              node={node}
              rijProps={kit.rijProps(node)}
              handvat={kit.handvat(node.id)}
              naam={kit.naamVeld(node.id, node.name, v => kit.updateNode(node.id, { name: v }))}
              notitie={notitie(node)}
              klant={stockRows.find(r => r.id === node.rawMaterialId)?.klant ?? null}
              berekend={materialCostPerPiece({ ...node, costOverride: null }, ctx)}
              onWijzig={p => kit.updateNode(node.id, p)}
              acties={kit.rijActies(node.id, () => kit.verwijder(node, 'Exoot'), 'Exoot verwijderen')}
            />
          ) : (
            <MateriaalRegel
              key={node.id}
              node={node}
              rijProps={kit.rijProps(node)}
              handvat={kit.handvat(node.id)}
              naam={kit.naamVeld(node.id, node.name, v => kit.updateNode(node.id, { name: v }))}
              notitie={notitie(node)}
              bruto={brutoLengte(nettoLengte(node, ctx), laderVoorRegel(node, ctx.machines))}
              machines={machines}
              voorraad={voorraadVan(node, stockRows)}
              berekend={materialCostPerPiece({ ...node, costOverride: null }, ctx)}
              onWijzig={p => kit.updateNode(node.id, p)}
              onBewerk={() => { if (!kit.readOnly) onWijzigMateriaal(node) }}
              acties={kit.rijActies(node.id, () => kit.verwijder(node, 'Materiaal'), 'Materiaal verwijderen')}
            />
          ))}
          <div className="acalc-addrow">
            <button type="button" className="acalc-addlink" onClick={onKies}><Ic d={Icon.plus} size={13} />Materiaal kiezen</button>
            <button type="button" className="acalc-addlink exoot" onClick={onExoot}><Ic d={Icon.plus} size={13} />Exoot aanmaken</button>
          </div>
        </>
      )}
    </>
  )
}
