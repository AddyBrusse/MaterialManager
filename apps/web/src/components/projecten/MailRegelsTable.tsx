import { useState } from 'react'
import { Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconHelpCircle, IconPlus } from '@tabler/icons-react'
import { mailImportsApi } from '../../api/mail-imports'
import type { CandidateLine, MailImport, MatchStatus } from '@stockmanager/shared'

/**
 * De regels die uit de mail zijn gehaald, met hun koppeling — §3.5/§3.7.
 *
 * Een correctie hier is niet alleen voor deze mail: de server onthoudt hem als
 * alias, zodat hetzelfde klantnummer de volgende keer meteen goed staat.
 */

interface Props {
  mailImport: MailImport
  articleOptions: { value: string; label: string }[]
  onChanged: (updated: MailImport) => void
}

const STATUS_META: Record<MatchStatus, { color: string; label: string; icon: React.ReactNode }> = {
  match:   { color: 'var(--success)', label: 'gekoppeld', icon: <IconCheck size={12} /> },
  twijfel: { color: 'var(--warning)', label: 'controleer', icon: <IconHelpCircle size={12} /> },
  nieuw:   { color: 'var(--text-4)',  label: 'nieuw',      icon: <IconPlus size={12} /> },
}

function Regel({
  line, articleOptions, busy, onPick,
}: {
  line: CandidateLine
  articleOptions: Props['articleOptions']
  busy: boolean
  onPick: (artikelId: string | null) => void
}) {
  const meta = STATUS_META[line.status]
  // Bij een gekoppelde regel de uitleg van díe treffer tonen, niet die van de
  // eerste kandidaat — daar staat bijvoorbeeld een revisieverschil in, en dat
  // is juist het geval dat iemand moet zien. Bij een handmatige keuze is er
  // niets uit te leggen: die kwam van een mens.
  const chosen = line.artikelId ? line.matches.find((m) => m.artikelId === line.artikelId) : null
  const toelichting = line.handmatig ? null : (chosen ?? line.matches[0])?.reden ?? null

  return (
    <tr>
      <td style={{ whiteSpace: 'nowrap' }}>{line.positie ?? '—'}</td>
      <td>
        <div className="mono" style={{ fontSize: 11.5 }}>{line.tekening ?? line.ruweTekst}</div>
        {line.rev && <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>rev {line.rev}</div>}
      </td>
      <td style={{ textAlign: 'right' }}>{line.qty ?? '—'}</td>
      <td style={{ minWidth: 220 }}>
        <Select
          size="xs"
          placeholder={line.status === 'nieuw' ? 'Geen artikel gevonden' : 'Kies artikel'}
          data={articleOptions}
          value={line.artikelId}
          onChange={onPick}
          disabled={busy}
          searchable
          clearable
        />
        {toelichting && (
          <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 2 }}>{toelichting}</div>
        )}
      </td>
      <td style={{ whiteSpace: 'nowrap', color: meta.color, fontSize: 11 }}>
        {meta.icon} {meta.label}
      </td>
    </tr>
  )
}

export function MailRegelsTable({ mailImport, articleOptions, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const lines = mailImport.kandidaten

  async function pick(lineId: string, artikelId: string | null) {
    setBusyId(lineId)
    try {
      onChanged(await mailImportsApi.setLineArticle(mailImport.id, lineId, artikelId))
    } catch (err) {
      notifications.show({ color: 'red', title: 'Koppelen mislukt', message: (err as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  if (lines.length === 0) {
    return (
      <div className="ad-card" style={{ marginBottom: 10 }}>
        <div className="ad-eyebrow">Regels</div>
        <div style={{ fontSize: 12, color: 'var(--text-4)' }}>
          Geen regels herkend in deze mail. Voeg ze straks handmatig toe aan de offerte.
        </div>
      </div>
    )
  }

  const open = lines.filter((l) => !l.artikelId).length

  return (
    <div className="ad-card" style={{ marginBottom: 10 }}>
      <div className="ad-eyebrow">
        Regels ({lines.length})
        {open > 0 && <span style={{ color: 'var(--warning)' }}> · {open} nog te koppelen</span>}
      </div>
      <table className="st-table" style={{ width: '100%', fontSize: 11.5 }}>
        <thead>
          <tr>
            <th style={{ width: 30 }}>#</th>
            <th>Tekening</th>
            <th style={{ width: 44, textAlign: 'right' }}>Aantal</th>
            <th>Artikel</th>
            <th style={{ width: 92 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <Regel
              key={l.id}
              line={l}
              articleOptions={articleOptions}
              busy={busyId === l.id}
              onPick={(artikelId) => pick(l.id, artikelId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
