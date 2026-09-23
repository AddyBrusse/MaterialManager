// Alle pakbonnen van een project, één kaart per bon.
//
// Eerder was er één pakbon per project en moesten álle orders gereed zijn
// voordat je hem kon maken. Dat klopt niet met hoe het werkelijk gaat: een
// order van 40 stuks gaat in twee of drie kisten de deur uit, en op de eerste
// zitten er 10. Aanmaken gebeurt nu op de projectpagina zelf, bij de kolomgroep
// Levering — daar staat ook hoeveel er klaarligt. Dit scherm is wat er ligt:
// lezen, en per bon markeren dat hij weg is.
import { IconSend } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { projectsApi, formatDate } from '../../api/projects'
import { articlesApi } from '../../api/articles'
import { ArtikelPreviewThumb } from './ArtikelPreviewThumb'
import { berekenVoortgang, type Project, type Paklijst } from '@stockmanager/shared'

interface Props {
  project: Project
  onChanged: () => void
}

export function PaklijstTab({ project, onChanged }: Props) {
  const voortgang = berekenVoortgang(project)

  function handleVerzend(paklijstId: string) {
    try {
      projectsApi.verzendPaklijst(project.id, paklijstId)
      notifications.show({ color: 'blue', message: `${paklijstId} als verzonden gemarkeerd` })
      onChanged()
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message })
    }
  }

  if (project.paklijsten.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 8,
        padding: 32, textAlign: 'center', color: 'var(--text-3)',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 8 }}>
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h6M7 16h4" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Nog geen pakbonnen</div>
        <div style={{ fontSize: 12.5 }}>
          {voortgang.klaar > 0
            ? `Er liggen ${voortgang.klaar} stuks klaar — maak een pakbon bij Levering op de projectpagina.`
            : 'Zodra er stuks gereedgemeld zijn, kun je ze op een pakbon zetten.'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {voortgang.klaar > 0 && (
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '10px 14px', fontSize: 12.5, color: 'var(--text-2)',
        }}>
          Er liggen nog <strong>{voortgang.klaar}</strong> stuks klaar die op geen enkele
          pakbon staan. Een volgende bon maak je bij Levering op de projectpagina.
        </div>
      )}
      {project.paklijsten.map((pl, index) => (
        <PakbonKaart
          key={pl.id}
          paklijst={pl}
          nummer={index + 1}
          project={project}
          onVerzend={() => handleVerzend(pl.id)}
        />
      ))}
    </div>
  )
}

function PakbonKaart({ paklijst, nummer, project, onVerzend }: {
  paklijst: Paklijst
  nummer: number
  project: Project
  onVerzend: () => void
}) {
  const aantal = paklijst.regels.reduce((t, r) => t + r.qty, 0)
  return (
    <div className="prj-off-card">
      <div className="prj-off-hd" style={{ cursor: 'default' }}>
        <div className="prj-off-nr">{paklijst.id}</div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {nummer}e levering · {aantal} stuks
        </span>
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
        <table className="st-tbl" style={{ fontSize: 12.5, tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th style={{ width: 88 }}>Art. No.</th>
              <th style={{ width: 116 }}>Voorbeeld</th>
              <th>Artikel</th>
              <th style={{ textAlign: 'right', width: 100 }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {paklijst.regels.map((r, i) => {
              const artikelId = project.productieOrders.find(o => o.id === r.productieOrderId)?.artikelId ?? null
              const art = artikelId ? articlesApi.list().find(a => a.id === artikelId) ?? null : null
              return (
                <tr key={`${r.productieOrderId}-${r.offerteRegelId ?? i}`}>
                  <td className="cell-muted">{i + 1}</td>
                  <td className="cell-muted cell-mono" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {artikelId ?? '—'}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <ArtikelPreviewThumb article={art} />
                  </td>
                  <td><span className="cell-strong">{r.artikelNaam}</span></td>
                  <td className="cell-num">{r.qty} {r.eenheid}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="prj-off-footer">
          <button className="st-btn sm ghost" disabled title="PDF generatie beschikbaar na backend implementatie">
            ↓ PDF
          </button>
          <div style={{ flex: 1 }} />
          {!paklijst.verzondenOp && (
            <button className="st-btn sm primary" onClick={onVerzend}>
              <IconSend size={13} />Markeer als verzonden
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
