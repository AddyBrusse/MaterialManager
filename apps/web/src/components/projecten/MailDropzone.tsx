import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { IconMail, IconLoader2 } from '@tabler/icons-react'
import { mailImportsApi } from '../../api/mail-imports'
import type { MailImport } from '@stockmanager/shared'

/**
 * Sleep een mail uit Outlook op een leeg project — features/60-mail-import.md §2.2.
 *
 * Dat dit werkt is gemeten (§2.1): Outlook levert een echt `.msg` met inhoud.
 * Twee dingen die uit die meting volgen en hier zichtbaar zijn:
 *  - `file.type` is leeg, dus valideren op de naam en verder op de inhoud
 *    (de server kijkt naar de magic bytes en wijst de rest af)
 *  - `dragover` moet `preventDefault()` doen, anders opent de browser het
 *    bestand gewoon en ben je het project kwijt
 */

interface Props {
  projectId: string
  onImported: (mailImport: MailImport) => void
}

function isMsgFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.msg')
}

/**
 * De stappen die het inlezen doorloopt, met de tekst die erbij hoort.
 *
 * Het duurt tientallen seconden — uploaden, pdf's uitlezen, en twee lezingen
 * door het model — en zonder terugkoppeling lijkt het scherm te hangen. De
 * verstreken tijd staat erbij omdat "het duurt lang" iets anders is dan "het
 * doet niets", en dat verschil zie je alleen aan een lopende teller.
 */
const STAPPEN = [
  { na: 0, tekst: 'Bericht uploaden…' },
  { na: 3, tekst: 'Bijlagen uitpakken en pdf-tekst lezen…' },
  { na: 8, tekst: 'De AI leest de order…' },
  { na: 30, tekst: 'Controlelezing…' },
  { na: 60, tekst: 'Nog bezig — een order met scans kost meer tijd…' },
] as const

export function MailDropzone({ projectId, onImported }: Props) {
  const [hot, setHot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [seconden, setSeconden] = useState(0)

  // Eén teller die loopt zolang er iets binnengehaald wordt.
  useEffect(() => {
    if (!busy) { setSeconden(0); return }
    const t = setInterval(() => setSeconden((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [busy])

  const stap = [...STAPPEN].reverse().find((s) => seconden >= s.na) ?? STAPPEN[0]

  async function ingest(file: File) {
    setBusy(true)
    try {
      const result = await mailImportsApi.upload(file)
      if (result.duplicate) {
        notifications.show({
          color: result.refreshed ? 'blue' : 'orange',
          title: 'Deze mail was er al',
          message: result.refreshed
            ? 'De eerdere import is opnieuw uitgelezen — er was nog niets over beslist.'
            : 'Er is niets dubbel aangemaakt; de eerdere import wordt geopend zoals hij was.',
        })
      }
      onImported(result.mailImport)
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Importeren mislukt',
        message: (err as Error).message,
      })
    } finally {
      setBusy(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setHot(false)
    if (busy) return

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) {
      // Outlook biedt bij een mail ook `text/plain` aan (de lijstregel), maar
      // zonder bestand valt er niets te importeren.
      notifications.show({
        color: 'red',
        title: 'Geen bestand ontvangen',
        message: 'Sleep de mail vanuit de berichtenlijst, of sla hem eerst op als .msg.',
      })
      return
    }
    if (files.length > 1) {
      notifications.show({ color: 'orange', message: 'Eén mail tegelijk — de eerste wordt gebruikt.' })
    }
    const file = files[0]
    if (!isMsgFile(file)) {
      notifications.show({
        color: 'red',
        title: 'Dit is geen mail',
        message: `"${file.name}" is geen Outlook-bericht (.msg).`,
      })
      return
    }
    void ingest(file)
  }

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setHot(true) }}
      onDragOver={(e) => { e.preventDefault(); setHot(true) }}
      onDragLeave={() => setHot(false)}
      onDrop={handleDrop}
      style={{
        border: `1.5px dashed ${hot ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        background: hot ? 'var(--bg-hover)' : 'transparent',
        padding: '14px 16px',
        margin: '0 0 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'border-color .12s, background .12s',
      }}
      data-project={projectId}
    >
      {busy ? (
        <IconLoader2 size={18} style={{ animation: 'mi-spin 1s linear infinite', color: 'var(--accent)' }} />
      ) : (
        <IconMail size={18} style={{ color: hot ? 'var(--accent)' : 'var(--text-4)' }} />
      )}
      <div style={{ lineHeight: 1.35, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
          {busy ? stap.tekst : 'Sleep hier een mail uit Outlook'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          {busy
            ? `${seconden} seconden bezig — dit duurt meestal een halve tot anderhalve minuut.`
            : 'De aanvraag of orderbevestiging wordt uitgelezen en klaargezet ter controle.'}
        </div>
        {busy && (
          <div className="mi-voortgang" aria-label="bezig">
            <span />
          </div>
        )}
      </div>
    </div>
  )
}
