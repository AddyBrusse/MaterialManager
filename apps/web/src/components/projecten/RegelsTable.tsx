import type { ReactNode } from 'react'
import { IconPencil, IconTrash } from '@tabler/icons-react'
import type { Grade, Profile, OfferteRegel } from '@stockmanager/shared'
import type { Machine } from '../../api/machines'
import { articlesApi, type Article } from '../../api/articles'
import { buildEstimateCtx, computeEstimateTotals } from '../../api/estimate'
import { formatBedrag } from '../../api/projects'
import { ArtikelPreviewThumb } from './ArtikelPreviewThumb'

// Shared by OfferteTab and OpdrachtbevestigingTab — both rendered the exact
// same 12-column table before this was extracted. The thumbnail column
// (between Art. No. and Omschrijving) lives here once instead of twice.

interface RegelsTableProps {
  regels: OfferteRegel[]
  grades: Grade[]
  profiles: Profile[]
  machines: Machine[]
  isLocked?: boolean
  onRowClick?: (r: OfferteRegel) => void
  onDeleteRegel?: (id: string) => void
  footerRows: ReactNode
}

export function RegelsTable({
  regels, grades, profiles, machines, isLocked, onRowClick, onDeleteRegel, footerRows,
}: RegelsTableProps) {
  const allArticles = articlesApi.list()
  const showActions = !isLocked && !!onDeleteRegel

  function getArt(id: string | null): Article | null {
    if (!id) return null
    return allArticles.find(a => a.id === id) ?? null
  }

  function getKostprijs(art: Article | null, qty = 1): number {
    if (!art?.estimate) return 0
    try {
      const ctx = buildEstimateCtx(art, grades, profiles, machines)
      return computeEstimateTotals(art.estimate, ctx, qty).cost
    } catch { return 0 }
  }

  function getMateriaal(art: Article | null): string {
    if (!art?.recipe) return '—'
    const p = profiles.find(pr => pr.id === art.recipe!.profileId)
    const g = grades.find(gr => gr.id === art.recipe!.gradeId)
    return [p?.name, g?.name].filter(Boolean).join(' · ') || '—'
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="st-tbl" style={{ fontSize: 12, tableLayout: 'fixed', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ width: 88 }}>Art. No.</th>
            <th style={{ width: 116 }}>Voorbeeld</th>
            <th>Omschrijving</th>
            <th style={{ width: 115 }}>Tekeningnummer</th>
            <th style={{ width: 56 }}>Revisie</th>
            <th style={{ width: 170 }}>Bewerkingen</th>
            <th style={{ width: 90 }}>Materiaal</th>
            <th style={{ width: 82, textAlign: 'right' }}>Kostprijs</th>
            <th style={{ width: 68, textAlign: 'right' }}>Qty</th>
            <th style={{ width: 60, textAlign: 'right' }}>Marge %</th>
            <th style={{ width: 22 }} />
            <th style={{ width: 96, textAlign: 'right' }}>Verkoopprijs</th>
            <th style={{ width: 100, textAlign: 'right' }}>Totaal</th>
            {showActions && <th style={{ width: 86 }} />}
          </tr>
        </thead>
        <tbody>
          {regels.map(r => {
            const art = getArt(r.artikelId)
            const kostprijs = getKostprijs(art, r.qty)
            const marge = kostprijs > 0 ? Math.round(((r.verkoopprijs / kostprijs) - 1) * 100) : null
            return (
              <tr
                key={r.id}
                style={{ cursor: onRowClick && !isLocked ? 'pointer' : 'default' }}
                onClick={() => onRowClick && !isLocked && onRowClick(r)}
              >
                <td className="cell-muted cell-mono" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.artikelId ?? '—'}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <ArtikelPreviewThumb article={art} />
                </td>
                <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span className="cell-strong">{r.naam}</span>
                </td>
                <td className="cell-muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {art?.tekening ?? '—'}
                </td>
                <td className="cell-muted" style={{ fontSize: 11.5 }}>{art?.rev ?? '—'}</td>
                <td>
                  {r.bewerkingen.length > 0
                    ? <div className="op-chips">{r.bewerkingen.map((b, i) => <span key={i} className="op-chip">{b}</span>)}</div>
                    : <span className="cell-muted" style={{ fontSize: 11.5 }}>—</span>}
                </td>
                <td className="cell-muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getMateriaal(art)}
                </td>
                <td className="cell-num cell-muted cell-mono" style={{ fontSize: 11.5 }}>
                  {kostprijs > 0 ? formatBedrag(kostprijs) : '—'}
                </td>
                <td className="cell-num">{r.qty} {r.eenheid}</td>
                <td className="cell-num cell-muted" style={{ fontSize: 11.5 }}>
                  {marge != null ? `${marge}%` : '—'}
                </td>
                <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ display: 'block', margin: '0 auto' }}>
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                  </svg>
                </td>
                <td className="cell-num cell-mono">{formatBedrag(r.verkoopprijs)}</td>
                <td className="cell-num cell-mono cell-strong">{formatBedrag(r.totaal)}</td>
                {showActions && (
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {onRowClick && (
                        <button className="st-icon-btn" title="Bewerken" onClick={() => onRowClick(r)}>
                          <IconPencil size={13} />
                        </button>
                      )}
                      <button className="st-icon-btn danger" title="Verwijderen" onClick={() => onDeleteRegel!(r.id)}>
                        <IconTrash size={13} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
        <tfoot>{footerRows}</tfoot>
      </table>
    </div>
  )
}
