import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconSearch, IconTrash } from '@tabler/icons-react'
import { relatiesApi, type Relatie } from '../../api/relaties'

// ── helpers ───────────────────────────────────────────────────────────────────
export function TypeBadge({ type }: { type: Relatie['type'] }) {
  if (type === 'klant')       return <span className="st-badge ok"><span className="dot" />Klant</span>
  if (type === 'leverancier') return <span className="st-badge info"><span className="dot" />Leverancier</span>
  return <span className="st-badge warn"><span className="dot" />Klant &amp; leverancier</span>
}

// ── page ──────────────────────────────────────────────────────────────────────
type Filter = 'alle' | 'klanten' | 'leveranciers'

export function RelatiesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: res } = useQuery({ queryKey: ['relaties'], queryFn: relatiesApi.list })
  const rows = res?.data ?? []

  const [filter, setFilter]   = useState<Filter>('alle')
  const [q, setQ]             = useState('')
  const [deleteId, setDelId]  = useState<string | null>(null)

  const deleteMut = useMutation({
    mutationFn: (id: string) => relatiesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['relaties'] })
      notifications.show({ color: 'green', message: 'Relatie verwijderd' })
      setDelId(null)
    },
  })

  function handleNieuweRelatie() {
    relatiesApi.create({
      naam: '', type: 'klant', actief: true, land: 'Nederland',
      factuurAdresZelfde: true, afleverAdresZelfde: true, contacten: [],
    }).then(({ data }) => {
      qc.invalidateQueries({ queryKey: ['relaties'] })
      navigate(`/relaties/${data.id}`)
    })
  }

  const filtered = useMemo(() => {
    let f = rows
    if (filter === 'klanten')      f = f.filter(r => r.type !== 'leverancier')
    if (filter === 'leveranciers') f = f.filter(r => r.type !== 'klant')
    if (q) {
      const Q = q.toLowerCase()
      f = f.filter(r =>
        r.naam.toLowerCase().includes(Q) ||
        (r.stad ?? '').toLowerCase().includes(Q) ||
        (r.email ?? '').toLowerCase().includes(Q)
      )
    }
    return f
  }, [rows, filter, q])

  const toDelete = rows.find(r => r.id === deleteId)

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Relaties</div>
          <div className="st-page-sub">Klanten en leveranciers</div>
        </div>
        <div className="st-page-actions">
          <button className="st-btn primary" onClick={handleNieuweRelatie}>
            <IconPlus size={14} /> Nieuwe relatie
          </button>
        </div>
      </div>

      <div className="st-tabs">
        {(['alle', 'klanten', 'leveranciers'] as Filter[]).map(f => (
          <button key={f} className={`st-tab-btn${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'alle' ? 'Alle' : f === 'klanten' ? 'Klanten' : 'Leveranciers'}
            {f !== 'alle' && (
              <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>
                ({rows.filter(r => f === 'klanten' ? r.type !== 'leverancier' : r.type !== 'klant').length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="st-toolbar">
        <div className="st-search">
          <IconSearch size={14} />
          <input placeholder="Zoek op naam, stad of e-mail…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      <div className="st-table-wrap">
        <div className="st-tbl-scroll">
          <table className="st-tbl">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Type</th>
                <th>Stad</th>
                <th>Telefoon</th>
                <th>E-mail</th>
                <th>Status</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/relaties/${r.id}`)}>
                  <td><span className="cell-strong">{r.naam}</span></td>
                  <td><TypeBadge type={r.type} /></td>
                  <td className="cell-muted">{r.stad || '—'}</td>
                  <td className="cell-muted cell-mono" style={{ fontSize: 11.5 }}>{r.telefoon || '—'}</td>
                  <td className="cell-muted" style={{ fontSize: 11.5 }}>{r.email || '—'}</td>
                  <td>
                    <span className={`st-badge ${r.actief ? 'ok' : 'danger'}`}>
                      <span className="dot" />{r.actief ? 'Actief' : 'Inactief'}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="st-icon-btn" title="Verwijderen" onClick={() => setDelId(r.id)}>
                      <IconTrash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-4)', padding: '32px 0' }}>
                    Geen relaties gevonden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="st-tbl-foot">
          <span>{filtered.length} van {rows.length} relatie{rows.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <Modal opened={deleteId !== null} onClose={() => setDelId(null)} title="Relatie verwijderen" size="sm" centered>
        <p style={{ margin: '0 0 16px', fontSize: 13.5 }}>
          Weet je zeker dat je <strong>{toDelete?.naam}</strong> wilt verwijderen?<br />
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Gekoppelde artikelen blijven bestaan maar verliezen de relatiekoppeling.</span>
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="st-btn" onClick={() => setDelId(null)}>Annuleren</button>
          <button className="st-btn danger" onClick={() => deleteId && deleteMut.mutate(deleteId)}>Verwijderen</button>
        </div>
      </Modal>
    </>
  )
}
