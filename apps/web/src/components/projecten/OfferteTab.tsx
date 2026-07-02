import { useState } from 'react'
import { IconPlus, IconTrash, IconPencil, IconSend, IconCheck, IconChevronDown, IconChevronUp, IconMail } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { projectsApi, formatBedrag, formatDate } from '../../api/projects'
import { articlesApi, KNOWN_OPERATIONS, type Article } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { buildEstimateCtx, computeEstimateTotals } from '../../api/estimate'
import { relatiesApi } from '../../api/relaties'
import { downloadOffertePdf, buildOffertePdf } from '../../services/offerte-pdf'
import { sendViaMicrosoft365, pdfToBase64 } from '../../services/graph-mail'
import { companyApi } from '../../api/company'
import { useUserStore } from '../../stores/user'
import { ArtikelPickerModal } from './ArtikelPickerModal'
import type { Project, Offerte, OfferteRegel } from '@stockmanager/shared'

// ── Offerte status config ─────────────────────────────────────────────────────

const OFF_STATUS: Record<Offerte['status'], { label: string; cls: string }> = {
  concept:      { label: 'Concept',      cls: 'st-badge' },
  verzonden:    { label: 'Verzonden',    cls: 'st-badge info' },
  geaccepteerd: { label: 'Geaccepteerd', cls: 'st-badge ok' },
  vervallen:    { label: 'Vervallen',    cls: 'st-badge' },
}

// ── Regel form drawer ─────────────────────────────────────────────────────────

interface RegelFormProps {
  projectId: string
  offerteId: string
  edit?: OfferteRegel
  onClose: () => void
  onSaved: () => void
}

function RegelForm({ projectId, offerteId, edit, onClose, onSaved }: RegelFormProps) {
  const articles = articlesApi.list()
  const [artikelId, setArtikelId]   = useState(edit?.artikelId ?? '')
  const [naam, setNaam]             = useState(edit?.naam ?? '')
  const [omschrijving, setOmsch]    = useState(edit?.omschrijving ?? '')
  const [qty, setQty]               = useState(String(edit?.qty ?? 1))
  const [eenheid, setEenheid]       = useState(edit?.eenheid ?? 'st.')
  const [prijs, setPrijs]           = useState(String(edit?.verkoopprijs ?? ''))

  function pickArticle(id: string) {
    setArtikelId(id)
    if (!id) return
    const art = articles.find(a => a.id === id)
    if (!art) return
    if (!edit) {
      setNaam(art.naam)
      setOmsch(art.tekening ? `Tekening: ${art.tekening}${art.rev ? ` rev ${art.rev}` : ''}` : '')
    }
    // suggest kostprijs from estimate as default verkoopprijs
    if (!prijs && art.estimate) {
      const { nodes, marginPct } = art.estimate
      // Simple sum of costs for suggestion
      const baseCost = nodes.reduce((s, n) => {
        if (n.type === 'external') return s + (n.externalCost ?? 0)
        return s
      }, 0)
      if (baseCost > 0) {
        const suggested = Math.ceil(baseCost * (1 + marginPct / 100) * 100) / 100
        setPrijs(String(suggested))
      }
    }
  }

  function getBewerkingen(): string[] {
    if (!artikelId) return []
    const art = articles.find(a => a.id === artikelId)
    if (!art) return []
    return art.operations.map(op => KNOWN_OPERATIONS.find(ko => ko.id === op.type)?.name ?? op.type)
  }

  function handleSave() {
    const qtyN = parseFloat(qty)
    const prijsN = parseFloat(prijs)
    if (!naam.trim() || isNaN(qtyN) || isNaN(prijsN)) return
    const data = {
      artikelId: artikelId || null,
      naam: naam.trim(),
      omschrijving: omschrijving.trim(),
      qty: qtyN,
      eenheid,
      verkoopprijs: prijsN,
      bewerkingen: getBewerkingen(),
    }
    if (edit) {
      projectsApi.updateOfferteRegel(projectId, offerteId, edit.id, {
        naam: data.naam, omschrijving: data.omschrijving,
        qty: data.qty, eenheid: data.eenheid, verkoopprijs: data.verkoopprijs,
      })
    } else {
      projectsApi.addOfferteRegel(projectId, offerteId, data)
    }
    onSaved()
  }

  const qtyN = parseFloat(qty) || 0
  const prijsN = parseFloat(prijs) || 0
  const totaal = Math.round(qtyN * prijsN * 100) / 100

  return (
    <>
      <div className="st-drawer-scrim" onClick={onClose} />
      <div className="st-drawer">
        <div className="st-drawer-hd">
          <div className="ttl">{edit ? 'Regel bewerken' : 'Artikel toevoegen'}</div>
          <button className="st-icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>×</button>
        </div>
        <div className="st-drawer-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="st-field">
            <label>Artikel (optioneel)</label>
            <select className="st-select" value={artikelId} onChange={e => pickArticle(e.target.value)}>
              <option value="">— Vrije regel (geen artikel) —</option>
              {articles.map(a => (
                <option key={a.id} value={a.id}>{a.naam} ({a.id})</option>
              ))}
            </select>
          </div>

          <div className="st-field">
            <label>Naam / omschrijving *</label>
            <input
              className="st-input"
              placeholder="bijv. RVS Beugel 40×4 · 316L"
              value={naam}
              onChange={e => setNaam(e.target.value)}
              autoFocus={!artikelId}
            />
          </div>

          <div className="st-field">
            <label>Detail / tekening</label>
            <input
              className="st-input"
              placeholder="bijv. Tekening DS-3312-C rev A"
              value={omschrijving}
              onChange={e => setOmsch(e.target.value)}
            />
          </div>

          <div className="st-grid-3">
            <div className="st-field">
              <label>Aantal *</label>
              <input
                className="st-input"
                type="number"
                min="0.01"
                step="1"
                value={qty}
                onChange={e => setQty(e.target.value)}
              />
            </div>
            <div className="st-field">
              <label>Eenheid</label>
              <select className="st-select" value={eenheid} onChange={e => setEenheid(e.target.value)}>
                <option value="st.">st.</option>
                <option value="m">m</option>
                <option value="kg">kg</option>
                <option value="set">set</option>
                <option value="uur">uur</option>
              </select>
            </div>
            <div className="st-field">
              <label>Verkoopprijs / stuk *</label>
              <input
                className="st-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={prijs}
                onChange={e => setPrijs(e.target.value)}
              />
            </div>
          </div>

          {qtyN > 0 && prijsN > 0 && (
            <div style={{
              background: 'var(--bg-chip)', borderRadius: 6, padding: '10px 14px',
              display: 'flex', justifyContent: 'space-between', fontSize: 13,
            }}>
              <span style={{ color: 'var(--text-3)' }}>{qtyN} {eenheid} × {formatBedrag(prijsN)}</span>
              <strong>{formatBedrag(totaal)}</strong>
            </div>
          )}

          {artikelId && getBewerkingen().length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)', marginBottom: 6 }}>
                Productie stappen (worden overgenomen bij acceptatie)
              </div>
              <div className="op-chips">
                {getBewerkingen().map((b, i) => (
                  <span key={i} className="op-chip">{b}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="st-drawer-ft">
          <button className="st-btn ghost" onClick={onClose}>Annuleren</button>
          <button
            className="st-btn primary"
            onClick={handleSave}
            disabled={!naam.trim() || isNaN(parseFloat(qty)) || isNaN(parseFloat(prijs))}
          >
            {edit ? 'Opslaan' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Offerte card ──────────────────────────────────────────────────────────────

interface OfferteCardProps {
  project: Project
  offerte: Offerte
  onChanged: () => void
}

function OfferteCard({ project, offerte, onChanged }: OfferteCardProps) {
  const user = useUserStore(s => s.user)
  const [expanded, setExpanded]   = useState(offerte.status !== 'vervallen')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editRegel, setEditRegel]   = useState<OfferteRegel | null>(null)
  const cfg = OFF_STATUS[offerte.status]
  const subtotaal = offerte.regels.reduce((s, r) => s + r.totaal, 0)
  const isLocked = offerte.status === 'geaccepteerd' || offerte.status === 'vervallen'

  const allArticles = articlesApi.list()
  const grades      = gradesApi.listSync()
  const profiles    = profilesApi.listSync()
  const machines    = machinesApi.listSync()

  function getArt(id: string | null): Article | null {
    if (!id) return null
    return allArticles.find(a => a.id === id) ?? null
  }

  function getKostprijs(art: Article | null): number {
    if (!art?.estimate) return 0
    try {
      const ctx = buildEstimateCtx(art, grades, profiles, machines)
      return computeEstimateTotals(art.estimate, ctx).cost
    } catch { return 0 }
  }

  function getMateriaal(art: Article | null): string {
    if (!art?.recipe) return '—'
    const p = profiles.find(pr => pr.id === art.recipe!.profileId)
    const g = grades.find(gr => gr.id === art.recipe!.gradeId)
    return [p?.name, g?.name].filter(Boolean).join(' · ') || '—'
  }

  function downloadPdf() {
    const relaties = relatiesApi.listSync()
    const relatie  = relaties.find(r => r.id === project.relatieId)
    const contact  = relatie?.contacten.find(c => c.id === project.contactId)
    downloadOffertePdf({
      id:             project.id,
      naam:           project.naam,
      klantNaam:      relatie?.naam,
      contactNaam:    contact?.naam,
      klantRef:       project.klantRef,
      levertijdDatum: project.levertijdDatum,
    }, offerte)
  }

  function handleVerstuur() {
    if (offerte.regels.length === 0) {
      notifications.show({ color: 'red', message: 'Voeg eerst artikelregels toe' })
      return
    }
    projectsApi.verzendOfferte(project.id, offerte.id)
    notifications.show({ color: 'blue', message: `Offerte ${offerte.id} als verzonden gemarkeerd` })
    onChanged()
  }

  const [mailSending, setMailSending] = useState(false)

  async function handleMailVerstuur() {
    if (offerte.regels.length === 0) {
      notifications.show({ color: 'red', message: 'Voeg eerst artikelregels toe voordat je verzendt' })
      return
    }

    const relaties = relatiesApi.listSync()
    const relatie  = relaties.find(r => r.id === project.relatieId)
    const contact  = relatie?.contacten.find(c => c.id === project.contactId)

    // resolve recipient email: contact first, then relatie-level
    const toEmail = contact?.email ?? relatie?.email ?? null
    if (!toEmail) {
      notifications.show({
        color: 'red',
        message: 'Geen e-mailadres bekend voor deze klant. Voeg toe via Relaties.',
      })
      return
    }

    if (!user?.email) {
      notifications.show({
        color: 'red',
        message: 'Stel uw M365 e-mailadres in via Instellingen → Gebruikers.',
      })
      return
    }

    const co = companyApi.getSync()
    if (!co.graphClientId || !co.graphTenantId) {
      notifications.show({
        color: 'red',
        message: 'Configureer Microsoft 365 in Instellingen → Bedrijf.',
      })
      return
    }

    setMailSending(true)
    try {
      const doc = buildOffertePdf({
        id:             project.id,
        naam:           project.naam,
        klantNaam:      relatie?.naam,
        contactNaam:    contact?.naam,
        klantRef:       project.klantRef,
        levertijdDatum: project.levertijdDatum,
      }, offerte)

      const aanhef = contact?.naam ? `Geachte ${contact.naam}` : `Geachte relatie`
      const handtekening = [user.name, user.achternaam].filter(Boolean).join(' ')
      const bodyHtml = `
        <p>${aanhef},</p>
        <p>Bijgaand ontvangt u onze offerte <strong>${offerte.id}</strong> voor ${project.naam}.</p>
        <p>Heeft u vragen, neem dan gerust contact met ons op.</p>
        <p>Met vriendelijke groet,<br>
        <strong>${handtekening}</strong>${user.titel ? `<br>${user.titel}` : ''}<br>
        ${co.naam}${co.telefoon ? `<br>${co.telefoon}` : ''}${co.email ? `<br>${co.email}` : ''}</p>
      `.trim()

      await sendViaMicrosoft365({
        to: toEmail,
        subject: `Offerte ${offerte.id} — ${project.naam}`,
        bodyHtml,
        attachments: [{
          name: `Offerte-${offerte.id}-v${offerte.versie}.pdf`,
          contentBytes: pdfToBase64(doc),
        }],
        loginHint: user.email,
      })

      // mark as sent in the project
      projectsApi.verzendOfferte(project.id, offerte.id)
      notifications.show({
        color: 'green',
        title: 'Offerte verstuurd',
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

  const [confirmAccept, setConfirmAccept] = useState(false)

  function handleAccepteer() {
    if (!confirmAccept) { setConfirmAccept(true); return }
    setConfirmAccept(false)
    projectsApi.accepteerOfferte(project.id, offerte.id, user?.name ?? 'Onbekend')
    notifications.show({ color: 'green', message: `Offerte ${offerte.id} geaccepteerd · productie orders aangemaakt` })
    onChanged()
  }

  function handleDeleteRegel(regelId: string) {
    projectsApi.removeOfferteRegel(project.id, offerte.id, regelId)
    onChanged()
  }

  return (
    <>
      <div className="prj-off-card" data-status={offerte.status}>
        {/* Card header */}
        <div className="prj-off-hd" onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
          <div className="prj-off-nr">{offerte.id}</div>
          <span className={cfg.cls} style={{ fontSize: 10.5 }}>
            <span className="dot" style={{ width: 5, height: 5 }} />{cfg.label}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            v{offerte.versie} · {formatDate(offerte.createdAt)}
            {offerte.verzondenOp ? ` · verstuurd ${formatDate(offerte.verzondenOp)}` : ''}
          </span>
          {subtotaal > 0 && (
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
              {formatBedrag(subtotaal)}
            </span>
          )}
          <span style={{ marginLeft: subtotaal > 0 ? 12 : 'auto', color: 'var(--text-3)' }}>
            {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </span>
        </div>

        {expanded && (
          <div className="prj-off-body">
            {/* Lines table */}
            {offerte.regels.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
              <table className="st-tbl" style={{ fontSize: 12, tableLayout: 'fixed', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 88 }}>Art. No.</th>
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
                    {!isLocked && <th style={{ width: 86 }} />}
                  </tr>
                </thead>
                <tbody>
                  {offerte.regels.map((r) => {
                    const art = getArt(r.artikelId)
                    const kostprijs = getKostprijs(art)
                    const marge = kostprijs > 0
                      ? Math.round(((r.verkoopprijs / kostprijs) - 1) * 100)
                      : null
                    return (
                    <tr key={r.id} style={{ cursor: isLocked ? 'default' : 'pointer' }}
                      onClick={() => !isLocked && setEditRegel(r)}>
                      <td className="cell-muted cell-mono" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.artikelId ?? '—'}
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
                      {!isLocked && (
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button className="st-icon-btn" title="Bewerken" onClick={() => setEditRegel(r)}>
                              <IconPencil size={13} />
                            </button>
                            <button className="st-icon-btn danger" title="Verwijderen" onClick={() => handleDeleteRegel(r.id)}>
                              <IconTrash size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                    <td colSpan={isLocked ? 11 : 12} style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>
                      Subtotaal excl. BTW
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {formatBedrag(subtotaal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              </div>
            ) : (
              <div className="st-empty" style={{ padding: '20px 14px' }}>
                Nog geen artikelregels. Voeg een artikel toe om de offerte op te bouwen.
              </div>
            )}

            {/* Card footer actions */}
            <div className="prj-off-footer">
              {!isLocked && (
                <button className="st-btn sm primary" onClick={() => setPickerOpen(true)}>
                  <IconPlus size={13} />Artikelen toevoegen
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button className="st-btn sm ghost" onClick={downloadPdf} title="Download offerte als PDF">
                ↓ PDF
              </button>
              {offerte.status === 'concept' && (
                <>
                  <button
                    className="st-btn sm primary"
                    onClick={handleMailVerstuur}
                    disabled={mailSending}
                    title="PDF bouwen en direct e-mailen via Microsoft 365"
                  >
                    <IconMail size={13} />{mailSending ? 'Versturen…' : 'Verstuur via e-mail'}
                  </button>
                  <button className="st-btn sm ghost" onClick={handleVerstuur} title="Markeer als verzonden zonder e-mail te sturen">
                    <IconSend size={13} />Markeer verzonden
                  </button>
                </>
              )}
              {offerte.status === 'verzonden' && !confirmAccept && (
                <button className="st-btn sm primary" onClick={handleAccepteer}>
                  <IconCheck size={13} />Klant akkoord · Accepteer
                </button>
              )}
              {offerte.status === 'verzonden' && confirmAccept && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Zeker weten?</span>
                  <button className="st-btn sm ghost" onClick={() => setConfirmAccept(false)}>Annuleer</button>
                  <button className="st-btn sm primary" onClick={handleAccepteer}>
                    <IconCheck size={13} />Ja, accepteer
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ArtikelPickerModal
        opened={pickerOpen}
        projectId={project.id}
        offerteId={offerte.id}
        relatieId={project.relatieId}
        onClose={() => setPickerOpen(false)}
        onAdded={() => { setPickerOpen(false); onChanged() }}
      />

      {editRegel && (
        <RegelForm
          projectId={project.id}
          offerteId={offerte.id}
          edit={editRegel}
          onClose={() => setEditRegel(null)}
          onSaved={() => { setEditRegel(null); onChanged() }}
        />
      )}
    </>
  )
}

// ── Tab ───────────────────────────────────────────────────────────────────────

interface Props {
  project: Project
  onChanged: () => void
}

export function OfferteTab({ project, onChanged }: Props) {
  const hasAccepted = project.offertes.some(o => o.status === 'geaccepteerd')

  function addOfferte() {
    projectsApi.addOfferte(project.id)
    onChanged()
  }

  const sorted = [...project.offertes].sort((a, b) => b.versie - a.versie)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {project.offertes.length === 0
            ? 'Maak een offerte aan om te beginnen.'
            : `${project.offertes.length} versie${project.offertes.length !== 1 ? 's' : ''} — nieuwste bovenaan`}
        </div>
        {!hasAccepted && (
          <button className="st-btn sm primary" onClick={addOfferte}>
            <IconPlus size={13} />Nieuwe versie
          </button>
        )}
      </div>

      {sorted.map(o => (
        <OfferteCard key={o.id} project={project} offerte={o} onChanged={onChanged} />
      ))}

      {project.offertes.length === 0 && (
        <div style={{
          background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 8,
          padding: 32, textAlign: 'center', color: 'var(--text-3)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Nog geen offerte</div>
          <div style={{ fontSize: 12.5 }}>Klik op "Nieuwe versie" om de eerste offerte aan te maken.</div>
        </div>
      )}
    </div>
  )
}
