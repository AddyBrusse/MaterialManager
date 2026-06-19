import { IconSend } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { projectsApi, getAcceptedOfferte, formatBedrag, formatDate } from '../../api/projects'
import type { Project } from '@stockmanager/shared'

interface Props {
  project: Project
  onChanged: () => void
}

export function FactuurTab({ project, onChanged }: Props) {
  const accepted = getAcceptedOfferte(project)

  function handleCreate() {
    try {
      projectsApi.createFactuur(project.id)
      notifications.show({ color: 'green', message: `Factuur ${project.factuur?.id ?? ''} aangemaakt` })
      onChanged()
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message })
    }
  }

  // No accepted offerte
  if (!accepted) {
    return (
      <div style={{
        background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 8,
        padding: 32, textAlign: 'center', color: 'var(--text-3)',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 8 }}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Geen geaccepteerde offerte</div>
        <div style={{ fontSize: 12.5 }}>Accepteer eerst een offerte voordat een factuur aangemaakt kan worden.</div>
      </div>
    )
  }

  // Not yet verzonden (paklijst not shipped)
  if (!project.factuur && project.status !== 'verzonden' && project.status !== 'gefactureerd') {
    return (
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
        padding: 24, textAlign: 'center', color: 'var(--text-3)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>
          Paklijst nog niet verzonden
        </div>
        <div style={{ fontSize: 12.5, marginBottom: 16 }}>
          Markeer de paklijst als verzonden voordat de factuur aangemaakt kan worden.
        </div>
        <div style={{
          background: 'var(--accent-soft)', border: '1px solid rgba(45,109,246,.2)',
          borderRadius: 6, padding: '8px 14px', fontSize: 12, color: 'var(--accent)',
          display: 'inline-block',
        }}>
          Tip: je kunt de factuur ook alvast aanmaken als je dat wilt — ga naar de Paklijst tab en markeer als verzonden.
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="st-btn sm primary" onClick={handleCreate}>
            Toch factuur aanmaken
          </button>
        </div>
      </div>
    )
  }

  // Ready to create
  if (!project.factuur) {
    const subtotaal = accepted.regels.reduce((s, r) => s + r.totaal, 0)
    const btw       = Math.round(subtotaal * 0.21 * 100) / 100
    const incl      = Math.round((subtotaal + btw) * 100) / 100
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="prj-off-card">
          <div className="prj-off-hd" style={{ cursor: 'default' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Factuur preview</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginLeft: 8 }}>
              Gebaseerd op {accepted.id} · v{accepted.versie}
            </span>
          </div>
          <div className="prj-off-body">
            <table className="st-tbl" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Omschrijving</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Qty</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Prijs/stuk</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Totaal</th>
                </tr>
              </thead>
              <tbody>
                {accepted.regels.map((r, i) => (
                  <tr key={r.id}>
                    <td className="cell-muted">{i + 1}</td>
                    <td>
                      <div className="cell-strong">{r.naam}</div>
                      {r.omschrijving && <div className="cell-muted" style={{ fontSize: 11.5 }}>{r.omschrijving}</div>}
                    </td>
                    <td className="cell-num">{r.qty} {r.eenheid}</td>
                    <td className="cell-num cell-mono">{formatBedrag(r.verkoopprijs)}</td>
                    <td className="cell-num cell-mono cell-strong">{formatBedrag(r.totaal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg)' }}>
                  <td colSpan={4} style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>Subtotaal excl. BTW</td>
                  <td className="cell-num cell-mono" style={{ padding: '7px 12px' }}>{formatBedrag(subtotaal)}</td>
                </tr>
                <tr style={{ background: 'var(--bg)' }}>
                  <td colSpan={4} style={{ padding: '4px 12px 7px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>BTW 21%</td>
                  <td className="cell-num cell-mono" style={{ padding: '4px 12px 7px' }}>{formatBedrag(btw)}</td>
                </tr>
                <tr style={{ background: 'var(--bg-sidebar)', borderTop: '2px solid var(--border-strong)' }}>
                  <td colSpan={4} style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>Totaal incl. BTW</td>
                  <td className="cell-num cell-mono" style={{ padding: '9px 12px', fontWeight: 700, fontSize: 13 }}>{formatBedrag(incl)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="prj-off-footer">
              <div style={{ flex: 1 }} />
              <button className="st-btn primary sm" onClick={handleCreate}>
                Factuur aanmaken (FACT-YYYY-NNN)
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Factuur exists
  const { factuur } = project
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="prj-off-card">
        <div className="prj-off-hd" style={{ cursor: 'default' }}>
          <div className="prj-off-nr">{factuur.id}</div>
          <span className={`st-badge ${factuur.verzondenOp ? 'ok' : 'info'}`} style={{ fontSize: 10.5 }}>
            <span className="dot" style={{ width: 5, height: 5 }} />
            {factuur.verzondenOp ? 'Verstuurd' : 'Aangemaakt'}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            {formatDate(factuur.createdAt)}
            {factuur.vervaldatum ? ` · vervaldatum ${formatDate(factuur.vervaldatum)}` : ''}
          </span>
        </div>
        <div className="prj-off-body">
          <table className="st-tbl" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th>Omschrijving</th>
                <th style={{ textAlign: 'right', width: 80 }}>Qty</th>
                <th style={{ textAlign: 'right', width: 110 }}>Prijs/stuk</th>
                <th style={{ textAlign: 'right', width: 110 }}>Totaal</th>
              </tr>
            </thead>
            <tbody>
              {factuur.regels.map((r, i) => (
                <tr key={r.offerteRegelId}>
                  <td className="cell-muted">{i + 1}</td>
                  <td><span className="cell-strong">{r.naam}</span></td>
                  <td className="cell-num">{r.qty} {r.eenheid}</td>
                  <td className="cell-num cell-mono">{formatBedrag(r.verkoopprijs)}</td>
                  <td className="cell-num cell-mono cell-strong">{formatBedrag(r.totaal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg)' }}>
                <td colSpan={4} style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>Subtotaal excl. BTW</td>
                <td className="cell-num cell-mono" style={{ padding: '7px 12px' }}>{formatBedrag(factuur.subtotaal)}</td>
              </tr>
              <tr style={{ background: 'var(--bg)' }}>
                <td colSpan={4} style={{ padding: '4px 12px 7px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>BTW {factuur.btwPct}%</td>
                <td className="cell-num cell-mono" style={{ padding: '4px 12px 7px' }}>{formatBedrag(factuur.btwBedrag)}</td>
              </tr>
              <tr style={{ background: 'var(--bg-sidebar)', borderTop: '2px solid var(--border-strong)' }}>
                <td colSpan={4} style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>Totaal incl. BTW</td>
                <td className="cell-num cell-mono" style={{ padding: '9px 12px', fontWeight: 700, fontSize: 13 }}>{formatBedrag(factuur.totaalInclBtw)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="prj-off-footer">
            <button className="st-btn sm ghost" disabled title="PDF generatie beschikbaar na backend implementatie">
              ↓ PDF
            </button>
            <div style={{ flex: 1 }} />
            {!factuur.verzondenOp && (
              <button
                className="st-btn sm primary"
                onClick={() => {
                  projectsApi.verzendFactuur(project.id)
                  notifications.show({ color: 'blue', message: 'Factuur als verstuurd gemarkeerd' })
                  onChanged()
                }}
              >
                <IconSend size={13} />Markeer als verstuurd
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
