import { IconBookmark } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { houdtVast } from '../../api/reservations'
import { useReserveringen } from '../../hooks/useReserveringen'

// Wat er aan materiaal voor dit project vastligt (punt 6 uit
// features/61-orderproces-backlog.md). Tot nu toe waren reserveringen en
// projecten twee losse werelden: een reservering hing alleen aan een handmatig
// ingetypt calculatienummer, dus vanaf het project was niet te zien of er al
// materiaal klaarlag.
export function ProjectReserveringen({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { data: alle = [] } = useReserveringen()

  const eigen = alle.filter(r => r.projectId === projectId)
  if (eigen.length === 0) return null

  const openMm = eigen.filter(houdtVast).reduce((s, r) => s + r.sawLength, 0)

  return (
    <div className="mi-card" style={{ marginTop: 14 }}>
      <div className="zaag-card-hd" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconBookmark size={14} />
        Gereserveerd materiaal
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>
          {eigen.length} staa{eigen.length === 1 ? 'f' : 'ven'} · {openMm.toLocaleString('nl-NL')} mm open
        </span>
      </div>
      <table className="st-tbl">
        <thead>
          <tr>
            <th>Staaf</th><th>Locatie</th><th>Materiaal</th>
            <th style={{ textAlign: 'right' }}>Stuks</th>
            <th style={{ textAlign: 'right' }}>Zaaglengte</th>
            <th>Machine</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {eigen.map(r => (
            <tr key={r.id} onClick={() => navigate('/reserveringen')} style={{ cursor: 'pointer' }}>
              <td className="cell-mono">{r.barCode}</td>
              <td>{r.barLocation || <span className="cell-muted">—</span>}</td>
              <td>{r.materiaal} ⌀{r.diameter}</td>
              <td style={{ textAlign: 'right' }}>{r.pieces}</td>
              <td style={{ textAlign: 'right' }}>{r.sawLength.toLocaleString('nl-NL')} mm</td>
              <td>{r.machine}</td>
              <td>
                <span className={`badge ${r.status === 'done' ? 'ok' : r.status === 'in_progress' ? 'info' : ''}`}>
                  <span className="dot" />
                  {r.status === 'done' ? 'Gezaagd' : r.status === 'in_progress' ? 'Bezig' : 'Open'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
