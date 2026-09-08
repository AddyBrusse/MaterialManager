import { useState } from 'react'
import { Modal, Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPaperclip, IconMailForward, IconMail } from '@tabler/icons-react'
import { mailImportsApi } from '../../api/mail-imports'
import { MailRegelsTable } from './MailRegelsTable'
import { neemRegelsOver } from './mail-naar-offerte'
import type { Project } from '@stockmanager/shared'
import { MAIL_INTENTS, type MailImport, type MailIntent, type SenderConfidence } from '@stockmanager/shared'

/**
 * Controlescherm — features/60-mail-import.md §3.7.
 *
 * De import stelt een relatie en een intent voor; hier bevestigt of corrigeert
 * een mens dat. Pas op "Koppelen" verandert er iets aan het project. Er gaat
 * nooit iets naar de klant zonder deze stap.
 */

interface Props {
  opened: boolean
  mailImport: MailImport
  projectId: string
  relatieOptions: { value: string; label: string }[]
  articleOptions: { value: string; label: string }[]
  /** Nodig om de regels op de offerte te kunnen zetten. */
  project: Project
  onClose: () => void
  onLinked: (mailImport: MailImport, relatieId: string | null) => void
  onOfferteChanged: () => void
}

const INTENT_LABELS: Record<MailIntent, string> = {
  offerteaanvraag: 'Offerteaanvraag',
  opdrachtbevestiging: 'Opdrachtbevestiging',
  onbekend: 'Nog onbekend',
}

const CONFIDENCE_STYLE: Record<SenderConfidence, { color: string; label: string }> = {
  hoog: { color: 'var(--success)', label: 'zeker' },
  midden: { color: 'var(--warning)', label: 'waarschijnlijk' },
  laag: { color: 'var(--danger)', label: 'onzeker — controleer' },
}

/**
 * Naam én adres als beide er zijn; anders wat er wél is. Veel .msg-berichten
 * dragen geen weergavenaam (gemeten, §2.4), en "— adres@klant.nl" leest dan
 * als een ontbrekend veld terwijl er niets mist.
 */
function Address({ naam, email }: { naam: string | null; email: string | null }) {
  if (!naam && !email) return <span style={{ color: 'var(--text-4)' }}>onbekend</span>
  return (
    <>
      {naam}
      {naam && email ? ' ' : null}
      {email && <span className="mono" style={{ color: 'var(--text-4)' }}>{email}</span>}
    </>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="info-line">
      <span className="k">{k}</span>
      <span className="v">{children}</span>
    </div>
  )
}

export function MailImportReview({
  opened, mailImport, projectId, relatieOptions, articleOptions, project, onClose, onLinked, onOfferteChanged,
}: Props) {
  const [relatieId, setRelatieId] = useState<string | null>(mailImport.relatieId)
  const [intent, setIntent] = useState<MailIntent>(mailImport.intent)
  const [current, setCurrent] = useState<MailImport>(mailImport)
  const [busy, setBusy] = useState(false)

  const res = mailImport.resolutie
  const conf = res ? CONFIDENCE_STYLE[res.confidence] : null
  const doorgestuurd = res?.origin === 'doorgestuurd'

  // Al regels op de offerte? Dan niet nog eens overnemen — dat zou de offerte
  // stilletjes verdubbelen. De knop verdwijnt dan gewoon.
  const laatsteOfferte = project.offertes[project.offertes.length - 1]
  const offerteIsLeeg = !laatsteOfferte || laatsteOfferte.regels.length === 0
  const overTeNemen = current.kandidaten.length

  async function link() {
    setBusy(true)
    try {
      const saved = await mailImportsApi.update(current.id, {
        relatieId,
        intent,
        projectId,
        status: 'verwerkt',
      })

      if (overTeNemen > 0 && offerteIsLeeg) {
        const klantNaam = relatieOptions.find((o) => o.value === relatieId)?.label ?? null
        const r = await neemRegelsOver({ project, mailImport: saved, klantNaam })
        onOfferteChanged()

        const nieuw = r.nieuweArtikelen.length
        notifications.show({
          color: r.zonderPrijs > 0 ? 'orange' : 'green',
          title: `${r.aantalRegels} regel${r.aantalRegels === 1 ? '' : 's'} op offerte ${r.offerteId}`,
          message: [
            nieuw > 0
              ? `${nieuw} nieuw artikel${nieuw === 1 ? '' : 'en'} aangemaakt (${r.nieuweArtikelen.join(', ')}) met de meegestuurde tekeningen.`
              : null,
            r.zonderPrijs > 0
              ? `${r.zonderPrijs} regel(s) staan op € 0 — daar moet nog een calculatie onder.`
              : 'Prijzen komen uit de calculatie van het artikel.',
          ]
            .filter(Boolean)
            .join(' '),
        })
      }

      onLinked(saved, relatieId)
      onClose()
    } catch (err) {
      notifications.show({ color: 'red', title: 'Opslaan mislukt', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  /**
   * Opnieuw laten uitlezen. Waarschuwen als er al keuzes in staan: die gaan
   * weg, en dat is precies wat je soms wilt maar nooit per ongeluk.
   */
  async function reread() {
    const handmatig = current.kandidaten.filter((k) => k.handmatig).length
    if (
      handmatig > 0 &&
      !window.confirm(
        `Er ${handmatig === 1 ? 'staat 1 handmatige koppeling' : `staan ${handmatig} handmatige koppelingen`} in deze mail. ` +
          'Opnieuw uitlezen gooit die weg. Doorgaan?'
      )
    ) {
      return
    }
    setBusy(true)
    try {
      setCurrent(await mailImportsApi.reread(current.id))
      notifications.show({ color: 'green', title: 'Opnieuw uitgelezen', message: 'De mail is vers bekeken.' })
    } catch (err) {
      notifications.show({ color: 'red', title: 'Opnieuw uitlezen mislukt', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function ignore() {
    setBusy(true)
    try {
      await mailImportsApi.update(mailImport.id, { status: 'genegeerd' })
      notifications.show({ color: 'gray', message: 'Mail genegeerd.' })
      onClose()
    } catch (err) {
      notifications.show({ color: 'red', title: 'Opslaan mislukt', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} size="1180px" title="Mail controleren" centered>
      <div className="mi-card">
        <div className="mi-card-hd">
          {doorgestuurd ? <IconMailForward size={13} /> : <IconMail size={13} />}
          <span className="title">{doorgestuurd ? 'Doorgestuurd bericht' : 'Bericht'}</span>
        </div>
        <div className="mi-card-body">
          <div className="mi-onderwerp">{mailImport.onderwerp || '(geen onderwerp)'}</div>
          <dl className="mi-meta">
            <dt>Afzender</dt>
            <dd><Address naam={mailImport.afzenderNaam} email={mailImport.afzenderEmail} /></dd>
            {doorgestuurd && (
              <>
                <dt>Oorspronkelijk van</dt>
                <dd><Address naam={res?.klant?.naam ?? null} email={res?.klant?.email ?? null} /></dd>
              </>
            )}
            <dt>Ontvangen</dt>
            <dd>{mailImport.ontvangenOp ? new Date(mailImport.ontvangenOp).toLocaleString('nl-NL') : '—'}</dd>
            {/* Wat de klant zelf als kenmerk gebruikt — daarmee zoekt hij later
                terug, dus het hoort zichtbaar te zijn vóór je koppelt. */}
            {mailImport.klantRef && (
              <>
                <dt>Referentie klant</dt>
                <dd className="mono">{mailImport.klantRef}</dd>
              </>
            )}
            {mailImport.leverdatum && (
              <>
                <dt>Gevraagde levering</dt>
                <dd>{new Date(mailImport.leverdatum).toLocaleDateString('nl-NL')}</dd>
              </>
            )}
            {res && conf && (
              <>
                <dt>Herkomst</dt>
                <dd>
                  <span style={{ color: conf.color, fontWeight: 600 }}>{conf.label}</span>
                  <span style={{ color: 'var(--text-4)' }}> — {res.reden}</span>
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {mailImport.bijlagen.length > 0 && (
        <div className="mi-card">
          <div className="mi-card-hd">
            <IconPaperclip size={13} />
            <span className="title">Bijlagen</span>
            <span className="badge">{mailImport.bijlagen.length}</span>
          </div>
          <div className="mi-card-body">
            {mailImport.bijlagen.map((b) => (
              <div key={b.path ?? b.filename}>
                <div className="mi-bijlage">
                  <span className="naam">
                    {b.path ? <a href={b.path} target="_blank" rel="noreferrer">{b.filename}</a> : b.filename}
                  </span>
                  <span className="maat">
                    {Math.max(1, Math.round(b.sizeBytes / 1024))} kB
                    {b.isEmbeddedMessage && <span style={{ color: 'var(--text-4)' }}> · bericht</span>}
                  </span>
                </div>
                {/* De uitgelezen tekst van een PDF. Hieruit komen de aantallen,
                    dus als een regel ontbreekt is dit de plek om te kijken wat
                    er wél gelezen is. */}
                {b.tekst && (
                  <details style={{ margin: '2px 0 6px' }}>
                    <summary className="mi-noot" style={{ cursor: 'pointer' }}>
                      Uitgelezen tekst ({b.tekst.length.toLocaleString('nl-NL')} tekens)
                      {b.tekstPath && (
                        <>
                          {' · '}
                          <a href={b.tekstPath} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                            volledig
                          </a>
                        </>
                      )}
                    </summary>
                    <textarea
                      readOnly
                      value={b.tekst}
                      spellCheck={false}
                      style={{
                        width: '100%', height: 160, marginTop: 4, resize: 'vertical',
                        fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5,
                        border: '1px solid var(--border)', borderRadius: 4,
                        background: 'var(--bg-2)', color: 'var(--text-2)', padding: 6,
                        whiteSpace: 'pre', overflow: 'auto',
                      }}
                    />
                  </details>
                )}
                {!b.tekst && b.filename.toLowerCase().endsWith('.pdf') && !b.isEmbeddedMessage && (
                  <div className="mi-noot">Geen tekst uit deze PDF te halen — waarschijnlijk een scan.</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Select
        size="xs"
        label="Relatie"
        description={
          mailImport.relatieId
            ? 'Voorgesteld op basis van de afzender — controleer of dit klopt.'
            : 'Geen relatie herkend. Kies zelf de juiste klant.'
        }
        placeholder="Kies een relatie"
        data={relatieOptions}
        value={relatieId}
        onChange={async (v) => {
          setRelatieId(v)
          // Een andere klant heeft andere geleerde koppelingen, dus de server
          // legt de regels opnieuw langs de artikelen.
          try {
            setCurrent(await mailImportsApi.update(current.id, { relatieId: v }))
          } catch { /* de keuze zelf blijft staan; koppelen slaat hem opnieuw op */ }
        }}
        searchable
        clearable
        mb="xs"
      />

      <MailRegelsTable
        mailImport={current}
        articleOptions={articleOptions}
        onChanged={setCurrent}
      />

      <Select
        size="xs"
        label="Soort bericht"
        data={MAIL_INTENTS.map((i) => ({ value: i, label: INTENT_LABELS[i] }))}
        value={intent}
        onChange={(v) => setIntent((v as MailIntent) ?? 'onbekend')}
        mb="md"
      />

      {mailImport.bodyText && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-4)' }}>Berichttekst</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, maxHeight: 220, overflow: 'auto', marginTop: 6 }}>
            {mailImport.bodyText}
          </pre>
        </details>
      )}

      {overTeNemen > 0 && !offerteIsLeeg && (
        <div className="mi-noot" style={{ marginBottom: 10 }}>
          De offerte heeft al regels — deze mailregels worden niet nog eens toegevoegd.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          className="st-btn sm ghost"
          onClick={reread}
          disabled={busy}
          title="Laat de AI opnieuw naar deze mail kijken. Kost een nieuwe aanroep van het model."
        >
          Opnieuw uitlezen
        </button>
        <button className="st-btn sm ghost" onClick={ignore} disabled={busy}>Negeren</button>
        <button className="st-btn primary sm" onClick={link} disabled={busy || !relatieId}>
          {busy
            ? 'Bezig…'
            : overTeNemen > 0 && offerteIsLeeg
            ? `Koppelen en ${overTeNemen} regel${overTeNemen === 1 ? '' : 's'} overnemen`
            : 'Koppelen aan project'}
        </button>
      </div>
    </Modal>
  )
}
