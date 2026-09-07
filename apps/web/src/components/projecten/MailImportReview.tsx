import { useState } from 'react'
import { Modal, Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPaperclip, IconMailForward, IconMail } from '@tabler/icons-react'
import { mailImportsApi } from '../../api/mail-imports'
import { MailRegelsTable } from './MailRegelsTable'
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
  onClose: () => void
  onLinked: (mailImport: MailImport, relatieId: string | null) => void
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

export function MailImportReview({ opened, mailImport, projectId, relatieOptions, articleOptions, onClose, onLinked }: Props) {
  const [relatieId, setRelatieId] = useState<string | null>(mailImport.relatieId)
  const [intent, setIntent] = useState<MailIntent>(mailImport.intent)
  const [current, setCurrent] = useState<MailImport>(mailImport)
  const [busy, setBusy] = useState(false)

  const res = mailImport.resolutie
  const conf = res ? CONFIDENCE_STYLE[res.confidence] : null
  const doorgestuurd = res?.origin === 'doorgestuurd'

  async function link() {
    setBusy(true)
    try {
      const saved = await mailImportsApi.update(current.id, {
        relatieId,
        intent,
        projectId,
        status: 'verwerkt',
      })
      onLinked(saved, relatieId)
      onClose()
    } catch (err) {
      notifications.show({ color: 'red', title: 'Opslaan mislukt', message: (err as Error).message })
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
    <Modal opened={opened} onClose={onClose} size="lg" title="Mail controleren" centered>
      <div className="ad-card" style={{ marginBottom: 10 }}>
        <div className="ad-eyebrow">
          {doorgestuurd ? <IconMailForward size={13} /> : <IconMail size={13} />}
          {doorgestuurd ? 'Doorgestuurd bericht' : 'Bericht'}
        </div>
        <div className="info-primary" style={{ fontSize: 14 }}>{mailImport.onderwerp || '(geen onderwerp)'}</div>
        <div className="info-rows">
          <Row k="Afzender"><Address naam={mailImport.afzenderNaam} email={mailImport.afzenderEmail} /></Row>
          {doorgestuurd && (
            <Row k="Oorspronkelijk van"><Address naam={res?.klant?.naam ?? null} email={res?.klant?.email ?? null} /></Row>
          )}
          <Row k="Ontvangen">
            {mailImport.ontvangenOp ? new Date(mailImport.ontvangenOp).toLocaleString('nl-NL') : '—'}
          </Row>
          {res && conf && (
            <Row k="Herkomst">
              <span style={{ color: conf.color, fontWeight: 600 }}>{conf.label}</span>
              <span style={{ color: 'var(--text-4)' }}> — {res.reden}</span>
            </Row>
          )}
        </div>
      </div>

      {mailImport.bijlagen.length > 0 && (
        <div className="ad-card" style={{ marginBottom: 10 }}>
          <div className="ad-eyebrow"><IconPaperclip size={13} />Bijlagen ({mailImport.bijlagen.length})</div>
          <div className="info-rows">
            {mailImport.bijlagen.map((b) => (
              <div className="info-line" key={b.path ?? b.filename}>
                <span className="k" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.path ? <a href={b.path} target="_blank" rel="noreferrer">{b.filename}</a> : b.filename}
                </span>
                <span className="v mono">
                  {Math.max(1, Math.round(b.sizeBytes / 1024))} kB
                  {b.isEmbeddedMessage && <span style={{ color: 'var(--text-4)' }}> · bericht</span>}
                </span>
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

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="st-btn sm ghost" onClick={ignore} disabled={busy}>Negeren</button>
        <button className="st-btn primary sm" onClick={link} disabled={busy || !relatieId}>
          {busy ? 'Bezig…' : 'Koppelen aan project'}
        </button>
      </div>
    </Modal>
  )
}
