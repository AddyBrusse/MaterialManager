import { KNOWN_OPERATIONS, type Article } from '../../api/articles'
import type { Relatie } from '../../api/relaties'
import type { EstimateTotals } from '../../api/estimate'
import { Ic, Icon } from './calc-icons'

const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export interface ArticleMeta {
  naam: string
  relatieId: string | null
  contactId: string | null
  klant: string
  tekening: string
  rev: string
  operations: string[]
  currentStock: number | ''
  minStock: number | ''
  maxStock: number | ''
  locatie: string
}

export function toArticleMeta(a: Article): ArticleMeta {
  return {
    naam: a.naam,
    relatieId: a.relatieId,
    contactId: a.contactId,
    klant: a.klant ?? '',
    tekening: a.tekening ?? '',
    rev: a.rev ?? '',
    operations: a.operations.map(o => o.type),
    currentStock: a.currentStock,
    minStock: a.minStock ?? '',
    maxStock: a.maxStock ?? '',
    locatie: a.locatie ?? '',
  }
}

export function ArticleInfoStrip({
  article, editMode, meta, onChange, relatieOptions, relatie,
  gradeName, profileLabel, totals, onMarginChange, estUpdatedAt,
}: {
  article: Article
  editMode: boolean
  meta: ArticleMeta
  onChange: (patch: Partial<ArticleMeta>) => void
  relatieOptions: { value: string; label: string }[]
  relatie: Relatie | null
  gradeName: string
  profileLabel: string
  totals: EstimateTotals
  onMarginChange: (pct: number) => void
  estUpdatedAt: string | null
}) {
  const contacten = relatie?.contacten ?? []
  const contact = contacten.find(c => c.id === meta.contactId) ?? contacten[0]
  const cur = Number(meta.currentStock) || 0

  const toggleOp = (op: string) =>
    onChange({ operations: meta.operations.includes(op) ? meta.operations.filter(o => o !== op) : [...meta.operations, op] })

  return (
    <div className={`detail-info${editMode ? ' editing' : ''}`}>
      {/* KLANT */}
      <div className={`info-group${editMode ? ' editing' : ''}`}>
        <div className="info-group-label"><Ic d={Icon.user} />Klant</div>
        {editMode ? (
          <select className="info-primary-inp" value={meta.relatieId ?? ''}
            onChange={e => onChange({ relatieId: e.target.value || null, contactId: null, klant: relatieOptions.find(o => o.value === e.target.value)?.label ?? '' })}>
            <option value="">— Geen —</option>
            {relatieOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <div className="info-primary">{article.klant ?? '—'}</div>
        )}
        <div className="info-rows">
          <div className="info-line"><span className="k">Contact</span>
            {editMode && contacten.length > 0 ? (
              <select className="info-sel" value={contact?.id ?? ''}
                onChange={e => onChange({ contactId: e.target.value || null })}>
                {contacten.map(c => (
                  <option key={c.id} value={c.id}>{c.naam}{c.functie ? ` (${c.functie})` : ''}</option>
                ))}
              </select>
            ) : (
              <span className="v">{contact ? `${contact.naam}${contact.functie ? ` (${contact.functie})` : ''}` : '—'}</span>
            )}</div>
          <div className="info-line"><span className="k">Aangemaakt</span>
            <span className="v">{fmtDate(article.createdAt)}</span></div>
        </div>
      </div>

      {/* TEKENING */}
      <div className={`info-group${editMode ? ' editing' : ''}`}>
        <div className="info-group-label"><Ic d={Icon.ruler} />Tekening</div>
        {editMode ? (
          <input className="info-primary-inp mono" value={meta.tekening} onChange={e => onChange({ tekening: e.target.value })} />
        ) : (
          <div className="info-primary mono">{article.tekening ?? '—'}{article.rev ? ` · rev ${article.rev}` : ''}</div>
        )}
        <div className="info-rows">
          {editMode && (
            <div className="info-line"><span className="k">Revisie</span>
              <input className="info-inp" value={meta.rev} onChange={e => onChange({ rev: e.target.value })} /></div>
          )}
          <div className="info-line"><span className="k">Grondstof</span><span className="v">{profileLabel}</span></div>
          <div className="info-line"><span className="k">Kwaliteit</span><span className="v mono">{gradeName}</span></div>
          <div className="info-line"><span className="k">Bewerkingen</span>
            {editMode ? (
              <div className="art-tagbar">
                {KNOWN_OPERATIONS.map(o => (
                  <button key={o.id} type="button" className={`art-tag${meta.operations.includes(o.id) ? ' on' : ''}`} onClick={() => toggleOp(o.id)}>
                    {o.name}
                  </button>
                ))}
              </div>
            ) : (
              <span className="v">{meta.operations.length} stappen</span>
            )}
          </div>
        </div>
      </div>

      {/* PRIJS */}
      <div className="info-group">
        <div className="info-group-label"><Ic d={Icon.euro} />Prijs</div>
        <div className="info-primary mono">{eur(totals.sell)}</div>
        <div className="info-rows cols-2">
          <div className="info-line"><span className="k">Materiaal</span><span className="v mono">{eur(totals.materialTotal)}</span></div>
          <div className="info-line"><span className="k">Bewerking</span><span className="v mono">{eur(totals.machiningTotal)}</span></div>
          <div className="info-line"><span className="k">Uitbesteding</span><span className="v mono">{eur(totals.externalTotal)}</span></div>
          <div className="info-line"><span className="k">Kostprijs</span><span className="v mono">{eur(totals.cost)}</span></div>
          <div className="info-line"><span className="k">Marge</span>
            <span className="v mono">
              <input className="info-margin-inp" type="number" min={0} step={1}
                value={totals.marginPct} onChange={e => onMarginChange(e.target.value === '' ? 0 : +e.target.value)} />%
            </span></div>
          <div className="info-line"><span className="k">Bijgewerkt</span><span className="v mono">{fmtDate(estUpdatedAt)}</span></div>
        </div>
      </div>

      {/* VOORRAAD */}
      <div className={`info-group${editMode ? ' editing' : ''}`}>
        <div className="info-group-label"><Ic d={Icon.pkg} />Voorraad</div>
        {editMode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input className="info-primary-inp mono" type="number" min={0} style={{ maxWidth: 110 }}
              value={meta.currentStock} onChange={e => onChange({ currentStock: e.target.value === '' ? '' : Number(e.target.value) })} />
            <span style={{ color: 'var(--text-3)', fontSize: 13 }}>stuks</span>
          </div>
        ) : (
          <div className="info-primary mono">{cur} stuks</div>
        )}
        <div className="info-rows">
          {editMode ? (
            <>
              <div className="info-line"><span className="k">Min</span>
                <input className="info-inp" type="number" min={0} value={meta.minStock} onChange={e => onChange({ minStock: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
              <div className="info-line"><span className="k">Max</span>
                <input className="info-inp" type="number" min={0} value={meta.maxStock} onChange={e => onChange({ maxStock: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
              <div className="info-line"><span className="k">Locatie</span>
                <input className="info-inp" value={meta.locatie} onChange={e => onChange({ locatie: e.target.value })} /></div>
            </>
          ) : (
            <>
              <div className="info-line"><span className="k">Gereserveerd</span><span className="v mono">0</span></div>
              <div className="info-line"><span className="k">Vrij</span><span className="v mono">{cur}</span></div>
              <div className="info-line"><span className="k">Locatie</span><span className="v">{article.locatie ?? '—'}</span></div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
