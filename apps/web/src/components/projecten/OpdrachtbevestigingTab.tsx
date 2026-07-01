import { useState } from 'react'
import { IconSend, IconMail, IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { projectsApi, formatBedrag, formatDate } from '../../api/projects'
import { relatiesApi } from '../../api/relaties'
import { companyApi } from '../../api/company'
import { useUserStore } from '../../stores/user'
import {
  downloadOpdrachtbevestigingPdf,
  buildOpdrachtbevestigingPdf,
} from '../../services/opdrachtbevestiging-pdf'
import { sendViaMicrosoft365, pdfToBase64 } from '../../services/graph-mail'
import type { Project, Opdrachtbevestiging } from '@stockmanager/shared'

// ── Status config ─────────────────────────────────────────────────────────────

const OB_STATUS: Record<Opdrachtbevestiging['status'], { label: string; cls: string }> = {
  concept:   { label: 'Concept',   cls: 'st-badge' },
  verzonden: { label: 'Verzonden', cls: 'st-badge info' },
}

// ── OB card ───────────────────────────────────────────────────────────────────

interface OBCardProps {
  project: Project
  ob: Opdrachtbevestiging
  onChanged: () => void
}

function OBCard({ project, ob, onChanged }: OBCardProps) {
  const user = useUserStore(s => s.user)
  const [expanded, setExpanded] = useState(true)
  const [mailSending, setMailSending] = useState(false)
  const cfg = OB_STATUS[ob.status]
  const subtotaal = ob.regels.reduce((s, r) => s + r.totaal, 0)
  const btw       = Math.round(subtotaal * 0.21 * 100) / 100
  const totaal    = Math.round((subtotaal + btw) * 100) / 100

  const relaties = relatiesApi.listSync()
  const relatie  = relaties.find(r => r.id === project.relatieId)
  const contact  = relatie?.contacten.find(c => c.id === project.contactId)

  function getPdfProject() {
    return {
      id:             project.id,
      naam:           project.naam,
      klantNaam:      relatie?.naam,
      contactNaam:    contact?.naam,
      klantRef:       project.klantRef,
    }
  }

  function handleDownload() {
    downloadOpdrachtbevestigingPdf(getPdfProject(), ob)
  }

  function handleMarkVerzonden() {
    const updated = projectsApi.verzendOB(project.id)
    notifications.show({ color: 'blue', message: `${updated.opdrachtbevestiging?.id} als verzonden gemarkeerd` })
    onChanged()
  }

  async function handleMailVerstuur() {
    const toEmail = contact?.email ?? relatie?.email ?? null
    if (!toEmail) {
      notifications.show({ color: 'red', message: 'Geen e-mailadres bekend voor deze klant. Voeg toe via Relaties.' })
      return
    }
    if (!user?.email) {
      notifications.show({ color: 'red', message: 'Stel uw M365 e-mailadres in via Instellingen → Gebruikers.' })
      return
    }
    const co = companyApi.getSync()
    if (!co.graphClientId || !co.graphTenantId) {
      notifications.show({ color: 'red', message: 'Configureer Microsoft 365 in Instellingen → Bedrijf.' })
      return
    }

    setMailSending(true)
    try {
      const doc = buildOpdrachtbevestigingPdf(getPdfProject(), ob)
      const handtekening = [user.name, user.achternaam].filter(Boolean).join(' ')
      const aanhef = contact?.naam ? `Geachte ${contact.naam}` : 'Geachte relatie'
      const bodyHtml = `
        <p>${aanhef},</p>
        <p>Bijgaand ontvangt u onze opdrachtbevestiging <strong>${ob.id}</strong> voor ${project.naam}.</p>
        <p>Wij bevestigen hiermee de ontvangst van uw opdracht en zullen deze conform de bijgevoegde specificaties uitvoeren.</p>
        ${ob.levertijdDatum ? `<p><strong>Verwachte levertijd:</strong> ${formatDate(ob.levertijdDatum)}</p>` : ''}
        <p>Heeft u vragen, neem dan gerust contact met ons op.</p>
        <p>Met vriendelijke groet,<br>
        <strong>${handtekening}</strong>${user.titel ? `<br>${user.titel}` : ''}<br>
        ${co.naam}${co.telefoon ? `<br>${co.telefoon}` : ''}${co.email ? `<br>${co.email}` : ''}</p>
      `.trim()

      await sendViaMicrosoft365({
        to: toEmail,
        subject: `Opdrachtbevestiging ${ob.id} — ${project.naam}`,
        bodyHtml,
        attachments: [{ name: `Opdrachtbevestiging-${ob.id}.pdf`, contentBytes: pdfToBase64(doc) }],
        loginHint: user.email,
      })

      projectsApi.verzendOB(project.id)
      notifications.show({
        color: 'green',
        title: 'Opdrachtbevestiging verstuurd',
        message: `Verzonden naar ${toEmail} · opgeslagen in Verzonden`,
      })
      onChanged()
    } catch (e: unknown) {
      notifications.show({
        color: 'red',
        title: 'Versturen mislukt',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      })
    } finally {
      setMailSending(false)
    }
  }

  return (
    <div className="prj-off-card" data-status={ob.status}>
      {/* Header */}
      <div className="prj-off-hd" onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
        <div className="prj-off-nr">{ob.id}</div>
        <span className={cfg.cls} style={{ fontSize: 10.5 }}>
          <span className="dot" style={{ width: 5, height: 5 }} />{cfg.label}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          {formatDate(ob.createdAt)}
          {ob.verzondenOp ? ` · verstuurd ${formatDate(ob.verzondenOp)}` : ''}
        </span>
        {subtotaal > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
            {formatBedrag(totaal)} incl. BTW
          </span>
        )}
        <span style={{ marginLeft: subtotaal > 0 ? 12 : 'auto', color: 'var(--text-3)' }}>
          {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </span>
      </div>

      {expanded && (
        <div className="prj-off-body">
          {/* Regels table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="st-tbl" style={{ fontSize: 12, tableLayout: 'fixed', minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Omschrijving</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Qty</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Prijs/stuk</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Totaal</th>
                </tr>
              </thead>
              <tbody>
                {ob.regels.map((r, i) => (
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
                  <td className="cell-num cell-mono" style={{ padding: '9px 12px', fontWeight: 700, fontSize: 13 }}>{formatBedrag(totaal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Levertijddatum info */}
          {ob.levertijdDatum && (
            <div style={{
              margin: '12px 0 0',
              padding: '8px 14px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12.5,
            }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Verwachte levertijd</span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{formatDate(ob.levertijdDatum)}</span>
            </div>
          )}

          {/* Footer actions */}
          <div className="prj-off-footer">
            <div style={{ flex: 1 }} />
            <button className="st-btn sm ghost" onClick={handleDownload} title="Download als PDF">
              ↓ PDF
            </button>
            {ob.status === 'concept' && (
              <>
                <button
                  className="st-btn sm primary"
                  onClick={handleMailVerstuur}
                  disabled={mailSending}
                  title="PDF bouwen en direct e-mailen via Microsoft 365"
                >
                  <IconMail size={13} />{mailSending ? 'Versturen…' : 'Verstuur via e-mail'}
                </button>
                <button
                  className="st-btn sm ghost"
                  onClick={handleMarkVerzonden}
                  title="Markeer als verzonden zonder e-mail te sturen"
                >
                  <IconSend size={13} />Markeer verzonden
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab ───────────────────────────────────────────────────────────────────────

interface Props {
  project: Project
  onChanged: () => void
}

export function OpdrachtbevestigingTab({ project, onChanged }: Props) {
  const { opdrachtbevestiging: ob } = project

  if (!ob) {
    return (
      <div style={{
        background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 8,
        padding: 32, textAlign: 'center', color: 'var(--text-3)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Geen opdrachtbevestiging</div>
        <div style={{ fontSize: 12.5 }}>
          De opdrachtbevestiging wordt automatisch aangemaakt wanneer een offerte geaccepteerd wordt.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <OBCard project={project} ob={ob} onChanged={onChanged} />
    </div>
  )
}
