import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { IconExternalLink } from '@tabler/icons-react'
import { afspraakTekst, geldendeAfspraak, vandaagIso } from '@stockmanager/shared'
import { articlesApi, type Article } from '../../api/articles'
import { prijsafsprakenApi } from '../../api/prijsafspraken'

export function RelatieArtikelenTab({ relatieId }: { relatieId: string }) {
  const navigate = useNavigate()

  const { data: allArticles = [] } = useQuery({
    queryKey: ['articles'],
    queryFn: () => articlesApi.list(),
  })

  // De prijsafspraken met deze klant (2026-11-18): wat er vandaag bij 1 stuk geldt.
  const { data: afspraken = [] } = useQuery({
    queryKey: ['prijsafspraken', 'relatie', relatieId],
    queryFn: () => prijsafsprakenApi.list({ relatieId }),
  })
  const vandaag = vandaagIso()

  const linked: Article[] = useMemo(
    () => allArticles.filter(a => a.relatieId === relatieId),
    [allArticles, relatieId]
  )

  if (linked.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-4)', padding: '48px 0', fontSize: 13 }}>
        Geen artikelen gekoppeld aan deze relatie.<br />
        <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
          Koppel een klant via het Klant-veld op de artikelpagina.
        </span>
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
      <table className="st-tbl">
        <thead>
          <tr>
            <th>Artikelnr.</th>
            <th>Omschrijving</th>
            <th>Tekening</th>
            <th>Prijsafspraak</th>
            <th style={{ textAlign: 'right' }}>Vrij</th>
            <th style={{ textAlign: 'right' }}>Minimum</th>
            <th>Status</th>
            <th style={{ width: 36 }} />
          </tr>
        </thead>
        <tbody>
          {linked.map(a => {
            const cur = a.currentStock
            const min = a.minStock
            const statusCls = cur === 0 ? 'danger' : min != null && cur < min ? 'warn' : 'ok'
            const statusLabel = cur === 0 ? 'Uit' : min != null && cur < min ? 'Laag' : 'Op voorraad'
            const eigen = afspraken.filter(x => x.artikelId === a.id)
            const nu = geldendeAfspraak(eigen, 1, vandaag)
            const staffels = new Set(eigen.map(x => x.vanafAantal)).size

            return (
              <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/artikelen/${a.id}`)}>
                <td className="cell-mono" style={{ fontSize: 11.5 }}>{a.id}</td>
                <td><span className="cell-strong">{a.naam}</span></td>
                <td className="cell-muted">{a.tekening || '—'}</td>
                <td className={nu ? 'cell-mono' : 'cell-muted'} style={{ fontSize: 11.5 }}>
                  {nu ? afspraakTekst(nu) : eigen.length ? 'geen die nu geldt' : '—'}
                  {staffels > 1 && <span className="cell-muted"> · {staffels} staffels</span>}
                </td>
                <td style={{ textAlign: 'right' }}>{cur}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-3)' }}>{min ?? '—'}</td>
                <td>
                  <span className={`st-badge ${statusCls}`}>
                    <span className="dot" />{statusLabel}
                  </span>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <button className="st-icon-btn" title="Open artikel" onClick={() => navigate(`/artikelen/${a.id}`)}>
                    <IconExternalLink size={14} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
