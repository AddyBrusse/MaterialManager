import { useState } from 'react'
import { Select, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconCheck, IconHelpCircle, IconPlus } from '@tabler/icons-react'
import { mailImportsApi } from '../../api/mail-imports'
import { articlesApi, type Article } from '../../api/articles'
import { formatBedrag } from '../../api/projects'
import { resolvePreviewSourceFromFiles } from '../../utils/artikelPreview'
import type { PrijsBronnen } from '../../utils/artikel-prijs'
import { PreviewThumb } from './ArtikelPreviewThumb'
import { vergelijkPrijs, type PrijsVergelijking } from './mail-prijzen'
import type { CandidateLine, MailImport, MatchStatus } from '@stockmanager/shared'

/**
 * De regels uit de mail — features/60-mail-import.md §3.7.
 *
 * De kolommen staan in de volgorde waarin je ze leest bij het controleren van
 * een order: hoeveel, welk nummer noemt de klant, welke tekening is dat bij ons,
 * wat is het, en wat betaalt hij. De koppeling aan ons artikel staat eronder,
 * want dat is de enige kolom waar je iets moet beslissen.
 *
 * Wat er uit weg is: de onderbouwing van de zekerheid en de bestandsnamen. Die
 * staan in het technische paneel. Hier blijft één signaal over — een regel die
 * aandacht vraagt is oranje, meer niet.
 */

interface Props {
  mailImport: MailImport
  articleOptions: { value: string; label: string }[]
  bronnen: PrijsBronnen
  onChanged: (updated: MailImport) => void
}

const STATUS_META: Record<MatchStatus, { color: string; label: string; icon: React.ReactNode }> = {
  match:   { color: 'var(--success)', label: 'gekoppeld', icon: <IconCheck size={12} /> },
  twijfel: { color: 'var(--warning)', label: 'controleer', icon: <IconHelpCircle size={12} /> },
  nieuw:   { color: 'var(--text-4)',  label: 'nieuw',      icon: <IconPlus size={12} /> },
}

function Regel({
  line, bestanden, artikel, prijs, articleOptions, busy, onPick,
}: {
  line: CandidateLine
  bestanden: { name: string; url: string | null }[]
  artikel: Article | null
  prijs: PrijsVergelijking | null
  articleOptions: Props['articleOptions']
  busy: boolean
  onPick: (artikelId: string | null) => void
}) {
  const meta = STATUS_META[line.status]
  const laag = line.zekerheid < 0.55

  return (
    <tr>
      {/* Geen tekening bij deze regel? Dan ook geen lege plaatjeshouder —
          dat is ruimte die niets zegt. */}
      <td>{bestanden.length > 0 && <PreviewThumb source={resolvePreviewSourceFromFiles(bestanden)} size={56} />}</td>
      <td className="cell-num cell-strong">{line.qty ?? '—'}</td>
      <td className="cell-mono" style={{ paddingLeft: 14 }}>{line.klantArtikel ?? '—'}</td>
      <td className="cell-mono cell-strong" style={{ overflowWrap: 'anywhere' }}>
        {line.tekening ?? '—'}
        {line.rev && <span className="cell-muted"> rev {line.rev}</span>}
      </td>
      <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={line.omschrijving ?? ''}>
        {line.omschrijving ?? <span className="cell-muted">—</span>}
      </td>
      <td className="cell-num cell-mono">
        {line.klantPrijs === null ? (
          <span className="cell-muted">—</span>
        ) : prijs ? (
          // Een klant die met een oude prijslijst werkt moet je zien vóór je
          // bevestigt, niet bij het factureren.
          <Tooltip
            label={`Onze prijs bij ${line.qty ?? 1} stuks: ${formatBedrag(prijs.onze)} — ${
              prijs.klantLager ? 'de klant rekent te weinig' : 'de klant rekent meer dan wij vragen'
            } (${prijs.procent > 0 ? '+' : ''}${prijs.procent}%)`}
            withArrow
            multiline
            w={280}
          >
            <span style={{ color: 'var(--danger)', cursor: 'help', whiteSpace: 'nowrap' }}>
              <IconAlertTriangle size={11} style={{ verticalAlign: -1 }} /> {formatBedrag(line.klantPrijs)}
            </span>
          </Tooltip>
        ) : (
          formatBedrag(line.klantPrijs)
        )}
      </td>
      <td>
        <Select
          size="xs"
          placeholder={line.status === 'nieuw' ? 'Nieuw artikel' : 'Kies artikel'}
          data={articleOptions}
          value={line.artikelId}
          onChange={onPick}
          disabled={busy}
          searchable
          clearable
        />
        {artikel === null && line.status === 'nieuw' && (
          <div className="mi-noot">Wordt aangemaakt met de meegestuurde tekening.</div>
        )}
      </td>
      <td className="mi-status" style={{ color: laag ? 'var(--warning)' : meta.color }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
          {meta.icon} {meta.label}
        </span>
      </td>
    </tr>
  )
}

export function MailRegelsTable({ mailImport, articleOptions, bronnen, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const lines = mailImport.kandidaten
  const alleArtikelen = articlesApi.list()

  function artikelVan(line: CandidateLine): Article | null {
    return line.artikelId ? alleArtikelen.find((a) => a.id === line.artikelId) ?? null : null
  }

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

  const mislukt = mailImport.extractie?.foutmelding ?? null
  if (lines.length === 0) {
    return (
      <div className="mi-card">
        <div className="mi-card-hd"><span className="title">Regels</span></div>
        <div className="mi-card-body" style={{ color: mislukt ? 'var(--danger)' : 'var(--text-3)' }}>
          {mislukt ?? 'Geen regels herkend. Voeg ze straks handmatig toe aan de offerte.'}
        </div>
      </div>
    )
  }

  const vergelijkingen = lines.map((l) => vergelijkPrijs(l, artikelVan(l), bronnen))
  const afwijkend = vergelijkingen.filter(Boolean).length
  const open = lines.filter((l) => !l.artikelId).length

  return (
    <div className="mi-card">
      <div className="mi-card-hd">
        <span className="title">Regels</span>
        <span className="badge">{lines.length}</span>
        {open > 0 && <span className="mi-warn">{open} nieuw artikel</span>}
      </div>

      {afwijkend > 0 && (
        <div className="mi-alarm">
          <IconAlertTriangle size={14} />
          <span>
            {afwijkend === 1 ? 'Eén regel wijkt af' : `${afwijkend} regels wijken af`} van onze prijs —
            houd de order aan tegen de prijsafspraak voordat je bevestigt.
          </span>
        </div>
      )}

      <table className="st-table mi-table">
        <thead>
          <tr>
            <th style={{ width: 68 }} />
            <th style={{ width: 62 }}>Aantal</th>
            <th style={{ width: 110, paddingLeft: 14 }}>Art.nr klant</th>
            <th style={{ width: 150 }}>Tekening</th>
            <th>Omschrijving</th>
            <th style={{ width: 92 }}>Prijs klant</th>
            <th style={{ width: '26%' }}>Ons artikel</th>
            <th style={{ width: 104 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <Regel
              key={l.id}
              line={l}
              bestanden={bestandenVan(l)}
              artikel={artikelVan(l)}
              prijs={vergelijkingen[i]}
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
