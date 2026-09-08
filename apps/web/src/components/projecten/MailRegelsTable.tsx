import { useState } from 'react'
import { Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconHelpCircle, IconPlus } from '@tabler/icons-react'
import { mailImportsApi } from '../../api/mail-imports'
import type { CandidateLine, MailImport, MatchStatus } from '@stockmanager/shared'
import { ExtractieSamenvatting, ZekerheidBadge } from './ZekerheidBadge'

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
      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{line.positie ?? '—'}</td>
      <td style={{ verticalAlign: 'top' }}>
        {/* Tekeningnummers uit klantmail zijn lang (2604307-1-2615-0091-0530-1)
            en hebben geen spaties, dus expliciet breken — anders duwen ze de
            tabel breder dan de modal. */}
        <div className="mono" style={{ fontSize: 11.5, overflowWrap: 'anywhere' }}>
          {line.tekening ?? line.ruweTekst}
        </div>
        {line.rev && <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>rev {line.rev}</div>}
        {/* Tekeningen horen bíj een regel, niet ernaast — zonder dit stonden
            dezelfde onderdeel twee keer in de lijst. */}
        {line.bestanden.map((naam) => (
          <div key={naam} style={{ fontSize: 10, color: 'var(--text-4)', overflowWrap: 'anywhere' }}>
            📎 {naam}
          </div>
        ))}
      </td>
      <td style={{ textAlign: 'right', verticalAlign: 'top' }}>{line.qty ?? '—'}</td>
      <td style={{ verticalAlign: 'top' }}>
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
      <td style={{ color: meta.color, fontSize: 11, verticalAlign: 'top' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
          {meta.icon} {meta.label}
        </span>
        <div style={{ marginTop: 3 }}>
          <ZekerheidBadge zekerheid={line.zekerheid} redenen={line.zekerheidRedenen} />
        </div>
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

  // Niets uitgelezen mét een foutmelding is iets anders dan een mail zonder
  // regels: het eerste moet opvallen, want er is dan geen tweede motor die het
  // stilletjes overneemt.
  const mislukt = Boolean(mailImport.extractie?.foutmelding)

  if (lines.length === 0) {
    return (
      <div className="ad-card" style={{ marginBottom: 10 }}>
        <div className="ad-eyebrow">Regels</div>
        <div style={{ fontSize: 12, color: mislukt ? 'var(--danger)' : 'var(--text-4)' }}>
          {mislukt
            ? mailImport.extractie!.foutmelding
            : 'Geen regels herkend in deze mail. Voeg ze straks handmatig toe aan de offerte.'}
        </div>
        <ExtractieSamenvatting rapport={mailImport.extractie} />
      </div>
    )
  }

  const open = lines.filter((l) => !l.artikelId).length

  return (
    <div className="ad-card" style={{ marginBottom: 10 }}>
      <div className="ad-eyebrow">
        Regels ({lines.length})
        {open > 0 && <span style={{ color: 'var(--warning)' }}> · {open} nog te koppelen</span>}
        <ExtractieSamenvatting rapport={mailImport.extractie} />
      </div>
      {/* Vaste kolombreedtes: de inhoud (lange tekeningnummers, lange
          artikelnamen in de select) mag de tabel niet breder maken dan de
          modal — dat gaf een horizontale schuifbalk over het hele venster. */}
      <table className="st-table" style={{ width: '100%', tableLayout: 'fixed', fontSize: 11.5 }}>
        <thead>
          <tr>
            <th style={{ width: '6%' }}>#</th>
            <th style={{ width: '30%' }}>Tekening</th>
            <th style={{ width: '10%', textAlign: 'right' }}>Aantal</th>
            <th style={{ width: '33%' }}>Artikel</th>
            <th style={{ width: '21%' }}>Status</th>
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
