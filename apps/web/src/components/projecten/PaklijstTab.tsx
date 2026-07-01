import { IconSend } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { projectsApi, formatBedrag, formatDate, allOrdersGereed } from '../../api/projects'
import type { Project } from '@stockmanager/shared'

interface Props {
  project: Project
  onChanged: () => void
}

export function PaklijstTab({ project, onChanged }: Props) {
  const gereedCount = project.productieOrders.filter(o => o.status === 'gereed').length
  const totalOrders = project.productieOrders.length
  const canCreate   = allOrdersGereed(project) && !project.paklijst

  function handleCreate() {
    try {
      const updated = projectsApi.createPaklijst(project.id)
      notifications.show({ color: 'green', message: `Paklijst ${updated.paklijst?.id ?? ''} aangemaakt` })
      onChanged()
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message })
    }
  }

  function handleVerzend() {
    try {
      projectsApi.verzendPaklijst(project.id)
      notifications.show({ color: 'blue', message: 'Paklijst als verzonden gemarkeerd' })
      onChanged()
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message })
    }
  }

  // No production orders yet
  if (totalOrders === 0) {
    return (
      <div style={{
        background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 8,
        padding: 32, textAlign: 'center', color: 'var(--text-3)',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 8 }}>
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h6M7 16h4" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Geen productie orders</div>
        <div style={{ fontSize: 12.5 }}>Accepteer eerst een offerte om productie orders te starten.</div>
      </div>
    )
  }

  // Production running — not all done yet
  if (!allOrdersGereed(project) && !project.paklijst) {
    return (
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
        padding: 24, textAlign: 'center', color: 'var(--text-3)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--warning-soft)', display: 'grid', placeItems: 'center', margin: '0 auto 12px',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
          Productie nog niet klaar
        </div>
        <div style={{ fontSize: 12.5 }}>
          {gereedCount} van {totalOrders} orders gereed — alle orders moeten gereed zijn
          voordat de paklijst aangemaakt kan worden.
        </div>
        <div style={{ margin: '14px auto 0', height: 6, maxWidth: 200, background: 'var(--bg-chip)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            width: `${totalOrders > 0 ? (gereedCount / totalOrders) * 100 : 0}%`,
            height: '100%', background: 'var(--accent)', borderRadius: 'inherit',
          }} />
        </div>
      </div>
    )
  }

  // Ready to create
  if (canCreate) {
    return (
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--success)', borderRadius: 8,
        padding: 24, textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--success-soft)', display: 'grid', placeItems: 'center', margin: '0 auto 12px',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 6 }}>
          Alle {totalOrders} orders gereed
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 16 }}>
          De paklijst kan nu aangemaakt worden.
        </div>
        <button className="st-btn primary" onClick={handleCreate}>
          Paklijst aanmaken
        </button>
      </div>
    )
  }

  // Paklijst exists
  const { paklijst } = project
  if (!paklijst) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="prj-off-card">
        <div className="prj-off-hd" style={{ cursor: 'default' }}>
          <div className="prj-off-nr">{paklijst.id}</div>
          <span className={`st-badge ${paklijst.verzondenOp ? 'ok' : 'info'}`} style={{ fontSize: 10.5 }}>
            <span className="dot" style={{ width: 5, height: 5 }} />
            {paklijst.verzondenOp ? 'Verzonden' : 'Aangemaakt'}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            {formatDate(paklijst.createdAt)}
            {paklijst.verzondenOp ? ` · verzonden ${formatDate(paklijst.verzondenOp)}` : ''}
          </span>
        </div>
        <div className="prj-off-body">
          <table className="st-tbl" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th>Artikel</th>
                <th style={{ textAlign: 'right', width: 100 }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {paklijst.regels.map((r, i) => (
                <tr key={r.productieOrderId}>
                  <td className="cell-muted">{i + 1}</td>
                  <td><span className="cell-strong">{r.artikelNaam}</span></td>
                  <td className="cell-num">{r.qty} {r.eenheid}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="prj-off-footer">
            <button className="st-btn sm ghost" disabled title="PDF generatie beschikbaar na backend implementatie">
              ↓ PDF
            </button>
            <div style={{ flex: 1 }} />
            {!paklijst.verzondenOp && (
              <button className="st-btn sm primary" onClick={handleVerzend}>
                <IconSend size={13} />Markeer als verzonden
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
