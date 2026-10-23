import type { ReactNode } from 'react'
import type { EstimateNode } from '../../api/articles'
import type { EstimateCtx } from '../../api/estimate'
import { Ic, Icon } from './calc-icons'

/**
 * Wat de drie secties van de calculator (materialen, bewerkingen,
 * uitbestedingen) delen: de rekencontext, wijzigen en verwijderen, slepen, en
 * de vaste stukjes van een rij. Opgezet in `ArticleCalculator`.
 */
export interface CalcKit {
  ctx: EstimateCtx
  /** Iemand anders heeft het artikel open: niets wijzigen, niet slepen. */
  readOnly: boolean
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  updateNode: (id: string, p: Partial<EstimateNode>) => void
  /** Weghalen, met "Ongedaan maken" in de melding. */
  verwijder: (node: EstimateNode, wat: string) => void
  /** Drop-doel van een rij (slepen om te ordenen, binnen één sectie). */
  rijProps: (node: EstimateNode) => Record<string, unknown>
  /** Wat een element sleepbaar maakt (leeg bij alleen-lezen). */
  sleepProps: (id: string) => Record<string, unknown>
  /** Sleepgreep links in een rij. */
  handvat: (id: string) => ReactNode
  /** Naamveld dat pas typbaar wordt na het potloodje. */
  naamVeld: (id: string, value: string, onName: (v: string) => void, bold?: boolean) => ReactNode
  /** Potlood (naam bewerken) en prullenbak. */
  rijActies: (id: string, onDelete: () => void, deleteTitle: string) => ReactNode
}

export function SectieKop({ kit, id, icon, title, count, total }: {
  kit: CalcKit; id: string; icon: string; title: string; count: string; total: string
}) {
  return (
    <div className="acalc-section-head" onClick={() => kit.toggle(id)}>
      <span className="acalc-chevron" data-open={kit.isOpen(id)}><Ic d={Icon.chevronRight} size={14} /></span>
      <span className="acalc-section-title"><Ic d={icon} size={14} />{title}</span>
      <span className="acalc-section-count">{count}</span>
      <span className="acalc-section-total">{total}</span>
      <span />
    </div>
  )
}

export function Prullenbak({ onDelete, title, size = 14 }: { onDelete: () => void; title: string; size?: number }) {
  return (
    <button type="button" className="acalc-iconbtn del" title={title} onClick={onDelete}>
      <Ic d={Icon.trash} size={size} />
    </button>
  )
}
