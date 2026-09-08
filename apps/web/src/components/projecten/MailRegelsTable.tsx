import { useState } from 'react'
import { Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconHelpCircle, IconPlus } from '@tabler/icons-react'
import { mailImportsApi } from '../../api/mail-imports'
import { resolvePreviewSourceFromFiles } from '../../utils/artikelPreview'
import { PreviewThumb } from './ArtikelPreviewThumb'
import { ExtractieSamenvatting, ZekerheidBadge } from './ZekerheidBadge'
import type { CandidateLine, MailImport, MatchStatus } from '@stockmanager/shared'

/**
 * De regels die uit de mail zijn gehaald, met hun koppeling — §3.5/§3.7.
 *
 * Dezelfde tabelopmaak als de regeltabellen elders in het programma (st-table,
 * cell-mono, cell-num), met de preview-kolom vooraan die je ook op een offerte
 * of productieorder ziet. Een correctie hier is niet alleen voor deze mail: de
 * server onthoudt hem als alias, zodat hetzelfde klantnummer de volgende keer
 * meteen goed staat.
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
  line, bestanden, articleOptions, busy, onPick,
}: {
  line: CandidateLine
  /** De tekeningen van deze regel, met hun url onder /uploads. */
  bestanden: { name: string; url: string | null }[]
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
      <td>
        {/* De tekeningen van de klant, niet die van het artikel: dit is wat er
            in déze mail zat, en daar wil je naar kijken vóór je koppelt. */}
        <PreviewThumb source={resolvePreviewSourceFromFiles(bestanden)} size={64} />
      </td>
      <td className="cell-num cell-muted">{line.positie ?? '—'}</td>
      <td>
        {/* Tekeningnummers uit klantmail zijn lang (2604307-1-2615-0091-0530-1)
            en hebben geen spaties, dus expliciet breken — anders duwen ze de
            tabel breder dan de modal. */}
        <div className="cell-mono cell-strong" style={{ overflowWrap: 'anywhere' }}>
          {line.tekening ?? line.ruweTekst}
        </div>
        {line.rev && <div className="cell-muted" style={{ fontSize: 10.5 }}>rev {line.rev}</div>}
        {/* Bestandsnamen zijn lang en zeggen bij het controleren weinig — ze
            mogen de rij niet uit elkaar duwen. Afkappen, volledige naam in de
            title, en de preview ernaast doet het echte werk. */}
        {bestanden.map((b) => (
          <div key={b.name} className="mi-bestand" title={b.name}>{b.name}</div>
        ))}
      </td>
      <td className="cell-num cell-strong">{line.qty ?? '—'}</td>
      <td>
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
          <div className="cell-muted" style={{ fontSize: 10.5, marginTop: 2 }}>{toelichting}</div>
        )}
      </td>
      <td style={{ color: meta.color, fontSize: 11 }}>
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

  /** Bijlagenaam → het pad onder /uploads, zodat de preview hem kan laden. */
  function bestandenVan(line: CandidateLine) {
    return line.bestanden.map((naam) => ({
      name: naam,
      url: mailImport.bijlagen.find((b) => b.filename === naam)?.path ?? null,
    }))
  }

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
  // regels: het eerste moet opvallen, want er is geen tweede motor die het
  // stilletjes overneemt.
  const mislukt = Boolean(mailImport.extractie?.foutmelding)

  if (lines.length === 0) {
    return (
      <div className="mi-card">
        <div className="mi-card-hd">
          <span className="title">Regels</span>
        </div>
        <div className="mi-card-body">
          <div style={{ fontSize: 12, color: mislukt ? 'var(--danger)' : 'var(--text-4)' }}>
            {mislukt
              ? mailImport.extractie!.foutmelding
              : 'Geen regels herkend in deze mail. Voeg ze straks handmatig toe aan de offerte.'}
          </div>
          <ExtractieSamenvatting rapport={mailImport.extractie} />
        </div>
      </div>
    )
  }

  const open = lines.filter((l) => !l.artikelId).length

  return (
    <div className="mi-card">
      <div className="mi-card-hd">
        <span className="title">Regels</span>
        <span className="badge">{lines.length}</span>
        {open > 0 && <span className="mi-warn">{open} nog te koppelen</span>}
      </div>
      <div className="mi-card-body">
        <ExtractieSamenvatting rapport={mailImport.extractie} />
      </div>
      {/* Vaste kolombreedtes: de inhoud (lange tekeningnummers, lange
          artikelnamen in de select) mag de tabel niet breder maken dan de
          modal — dat gaf een horizontale schuifbalk over het hele venster. */}
      <table className="st-table mi-table">
        <thead>
          <tr>
            <th style={{ width: 76 }}></th>
            <th style={{ width: 40 }}>#</th>
            <th style={{ width: '30%' }}>Tekening</th>
            <th style={{ width: 60 }}>Aantal</th>
            <th style={{ width: '34%' }}>Artikel</th>
            <th style={{ width: 140 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <Regel
              key={l.id}
              line={l}
              bestanden={bestandenVan(l)}
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
