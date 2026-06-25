import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconChevronRight, IconList, IconFile, IconLayersLinked, IconTag, IconArrowRight, IconArrowBackUp,
} from '@tabler/icons-react'
import type { Relatie } from '@stockmanager/shared'
import type { Article } from '../../api/articles'
import {
  type PlanningStapItem,
  projectKleur, minToUren, klantNaam, effectiveMachine,
  workdaysLeft, dayIndexForDate, fmtDayShort,
} from '../../utils/planningKanbanUtils'

function articleTekening(article: Article | null): string | null {
  if (!article?.tekening) return null
  return article.rev ? `${article.tekening}-${article.rev}` : article.tekening
}

interface KanbanDetailsProps {
  item: PlanningStapItem | null
  article: Article | null
  relaties: Relatie[]
  windowStart: Date
  collapsed: boolean
  onToggle: () => void
  onUnplan: (item: PlanningStapItem) => void
  onFlash: (msg: string) => void
}

export function KanbanDetails({ item, article, relaties, windowStart, collapsed, onToggle, onUnplan, onFlash }: KanbanDetailsProps) {
  if (collapsed) {
    return (
      <aside className="kb-details collapsed">
        <div className="kb-det-head">
          <button className="kb-det-collapse" onClick={onToggle} title="Details tonen"><IconChevronRight size={15} /></button>
        </div>
        <div className="kb-det-rail">Details</div>
      </aside>
    )
  }

  return (
    <aside className="kb-details">
      <div className="kb-det-head">
        <span className="t">{item ? 'Taakdetails' : 'Details'}</span>
        <button className="kb-det-collapse" onClick={onToggle} title="Inklappen"><IconChevronRight size={15} /></button>
      </div>
      {!item ? (
        <div className="kb-det-empty">
          <span className="ic"><IconList size={18} /></span>
          <div>Selecteer een kaart om de tekening,<br />het project en de details te zien.</div>
        </div>
      ) : (
        <DetailBody item={item} article={article} relaties={relaties} windowStart={windowStart} onUnplan={onUnplan} onFlash={onFlash} />
      )}
    </aside>
  )
}

function fmtDateLong(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function DetailBody({ item, article, relaties, windowStart, onUnplan, onFlash }: Omit<KanbanDetailsProps, 'collapsed' | 'onToggle' | 'item'> & { item: PlanningStapItem }) {
  const navigate = useNavigate()
  const { stap, order, project } = item
  const tekening = articleTekening(article)
  const left = workdaysLeft(project.levertijdDatum, windowStart)
  const planned = stap.geplandDatum != null
  const machineNaam = effectiveMachine(stap) || 'Geen machine'
  const dlClass = left == null ? '' : left < 0 ? 'late' : 'warn'

  function openTekening() {
    if (article?.drawingPath) window.open(article.drawingPath, '_blank')
    else onFlash('Geen tekening gekoppeld')
  }

  return (
    <div className="kb-det-body" style={{ '--c': projectKleur(project.id) } as CSSProperties}>
      <div className="kb-drawing">
        <span className="corner" style={{ top: 10, left: 10, borderRight: 0, borderBottom: 0 }} />
        <span className="corner" style={{ top: 10, right: 10, borderLeft: 0, borderBottom: 0 }} />
        <span className="corner" style={{ bottom: 10, left: 10, borderRight: 0, borderTop: 0 }} />
        <span className="corner" style={{ bottom: 10, right: 10, borderLeft: 0, borderTop: 0 }} />
        <span className="label">tekening · preview</span>
        <span className="num">{tekening ?? order.artikelNaam}</span>
        <button className="btn sm openbtn" onClick={openTekening}><IconFile size={13} /> Open</button>
      </div>

      <div className="kb-det-title">
        <span className="sliver" />
        <div style={{ minWidth: 0 }}>
          <div className="nm">{order.artikelNaam}</div>
          {tekening && <div className="sub">{tekening}</div>}
        </div>
      </div>

      <div className="kb-det-badges">
        {planned
          ? <span className="badge info sm"><span className="dot" />Ingepland</span>
          : <span className="badge warn sm"><span className="dot" />Te plannen</span>}
        {left != null && left < 0 && <span className="badge danger sm"><span className="dot" />Te laat</span>}
        {left != null && left >= 0 && left <= 4 && <span className="badge warn sm">{left === 0 ? 'Vandaag leveren' : `${left} werkdg.`}</span>}
        <span className="badge sm">Stap {stap.volgorde}/{order.stappen.length}</span>
      </div>

      <div className="kb-det-grid">
        <div className="kb-det-row"><span className="k">Onderdeel</span><span className="v">{order.artikelNaam}</span></div>
        {tekening && <div className="kb-det-row"><span className="k">Tekeningnr.</span><span className="v mono">{tekening}</span></div>}
        <div className="kb-det-row"><span className="k">Klant</span><span className="v">{klantNaam(relaties, project)}</span></div>
        <div className="kb-det-row"><span className="k">Aantal</span><span className="v mono">{order.qty} {order.eenheid}</span></div>
        <div className="kb-det-row"><span className="k">Machine</span><span className="v">{machineNaam}</span></div>
        <div className="kb-det-row"><span className="k">Bewerkingstijd</span><span className="v mono">{minToUren(item.duurMin)}</span></div>
        <div className="kb-det-row">
          <span className="k">Gepland op</span>
          <span className="v">{stap.geplandDatum ? fmtDateLong(stap.geplandDatum) : 'niet ingepland'}</span>
        </div>
        <div className="kb-det-row">
          <span className="k">Leverdatum</span>
          <span className={`v mono ${dlClass}`}>
            {project.levertijdDatum ? fmtDayShort(dayIndexForDate(project.levertijdDatum, windowStart), windowStart) : '—'}
            {left != null && left < 0 ? ' · te laat' : ''}
          </span>
        </div>
      </div>

      <div className="kb-det-section-label">Snel naar</div>
      <button className="kb-link-row" onClick={openTekening}>
        <span className="ic"><IconFile size={15} /></span>
        <span className="lk"><span className="l1">Open tekening</span><span className="l2">{tekening ? `${tekening}.pdf` : 'geen tekening'}</span></span>
        <span className="chev"><IconArrowRight size={14} /></span>
      </button>
      <button className="kb-link-row" onClick={() => navigate(`/projecten/${project.id}`)}>
        <span className="ic" style={{ color: projectKleur(project.id), background: `color-mix(in srgb, ${projectKleur(project.id)} 14%, var(--bg-2))` }}>
          <IconLayersLinked size={15} />
        </span>
        <span className="lk"><span className="l1">Order {order.id}</span><span className="l2">{klantNaam(relaties, project)} · {order.stappen.length} bewerkingen</span></span>
        <span className="chev"><IconArrowRight size={14} /></span>
      </button>
      {order.artikelId && (
        <button className="kb-link-row" onClick={() => navigate(`/artikelen/${order.artikelId}`)}>
          <span className="ic"><IconTag size={15} /></span>
          <span className="lk"><span className="l1">Artikel {order.artikelNaam}</span><span className="l2">Stamgegevens &amp; calculatie</span></span>
          <span className="chev"><IconArrowRight size={14} /></span>
        </button>
      )}

      <div className="kb-det-section-label">Route ({order.stappen.length} bewerkingen)</div>
      <div className="kb-steps">
        {order.stappen.slice().sort((a, b) => a.volgorde - b.volgorde).map(s => (
          <div key={s.id} className={`kb-step${s.id === stap.id ? ' cur' : ''}`}>
            <span className="v">{s.volgorde}</span>
            <span className="mn">{effectiveMachine(s) || 'Geen machine'}</span>
            <span className={`st${s.geplandDatum != null ? ' planned' : ''}`}>
              {s.geplandDatum != null ? fmtDayShort(dayIndexForDate(s.geplandDatum, windowStart), windowStart) : 'te plannen'}
            </span>
          </div>
        ))}
      </div>

      {planned && (
        <div className="kb-det-actions">
          <button className="btn" onClick={() => onUnplan(item)}>
            <IconArrowBackUp size={13} /> Terug naar te plannen
          </button>
        </div>
      )}
    </div>
  )
}
