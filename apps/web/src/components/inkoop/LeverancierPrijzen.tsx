import { useState } from 'react'
import { IconEdit, IconTrash } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { geldendePrijzen, type LeverancierPrijs } from '@stockmanager/shared'
import { leverancierPrijzenApi, type PrijsFilter } from '../../api/leverancier-prijzen'
import { meldFout } from '../../utils/fout-melding-toon'
import { PrijsVenster, type DoelKeuze } from './PrijsVenster'

const eur = (n: number | null) => (n == null ? null : `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const datum = (iso: string) => new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })

interface Props {
  filter: PrijsFilter
  keuze: DoelKeuze
  /** Eerste kolom: de leverancier (bij een materiaal) of waar de prijs voor geldt (bij een leverancier). */
  kolom: 'leverancier' | 'doel'
  doelNaam?: (p: LeverancierPrijs) => string
  leeg: string
}

/**
 * Prijzen per leverancier (2026-10-06), als tabel met wijzigen en verwijderen.
 * Bij een materiaal tellen ook de prijzen van zijn kwaliteit mee — behalve bij
 * een leverancier die een eigen prijs voor dit materiaal heeft (`geldendePrijzen`).
 */
export function LeverancierPrijzen({ filter, keuze, kolom, doelNaam, leeg }: Props) {
  const qc = useQueryClient()
  const [venster, setVenster] = useState<{ bestaand?: LeverancierPrijs } | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['leverancier-prijzen', filter],
    queryFn: () => leverancierPrijzenApi.list(filter),
  })
  const verwijder = useMutation({
    mutationFn: (p: LeverancierPrijs) => leverancierPrijzenApi.remove(p.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leverancier-prijzen'] }); qc.invalidateQueries({ queryKey: ['inkoop'] }) },
    onError: (e, p) => meldFout({ actie: `Prijs van ${p.leverancierNaam} verwijderen`, fout: e, gevolg: 'De prijs staat er nog; er is niets verwijderd.' }),
  })

  const m = keuze.materiaal
  const rijen = m
    ? geldendePrijzen(data ?? [], m)
    : (data ?? []).map((p) => ({ ...p, via: (p.gradeId ? 'kwaliteit' : 'materiaal') as 'materiaal' | 'kwaliteit' }))

  return (
    <div className="lp-wrap">
      {isLoading ? <div className="st-empty">Prijzen laden…</div>
        : error ? <div className="st-empty">Prijzen konden niet geladen worden: {(error as Error).message}</div>
        : rijen.length === 0 ? <div className="lp-leeg">{leeg}</div>
        : (
          <table className="st-tbl lp-tbl">
            <thead>
              <tr>
                <th>{kolom === 'leverancier' ? 'Leverancier' : 'Geldt voor'}</th>
                <th>Prijs</th>
                <th>Zagen · minimum</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rijen.map((p) => (
                <tr key={p.id} title={p.notitie ?? undefined}>
                  <td>
                    <span className="cell-strong">{kolom === 'leverancier' ? p.leverancierNaam : (doelNaam?.(p) ?? '—')}</span>
                    {kolom === 'leverancier' && p.via === 'kwaliteit' && <span className="lp-via" title="Prijs voor de hele kwaliteit; geen eigen prijs voor dit materiaal">via kwaliteit</span>}
                    {kolom === 'doel' && <span className="lp-via">{p.via}</span>}
                    <div className="lp-sub">bijgewerkt {datum(p.updatedAt)}{p.bijgewerktDoor ? ` · ${p.bijgewerktDoor}` : ''}</div>
                  </td>
                  <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>
                    {eur(p.prijs)} <span className="cell-muted">{p.prijsSoort === 'per_kg' ? '/kg' : '/stuk'}</span>
                    <div className="lp-sub">{p.levertijdDagen != null ? `${p.levertijdDagen} werkdag${p.levertijdDagen === 1 ? '' : 'en'} levertijd` : 'levertijd onbekend'}</div>
                  </td>
                  <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>
                    {eur(p.zaagkostenPerSnede) ? `${eur(p.zaagkostenPerSnede)}/snede` : <span className="cell-muted">zagen in prijs</span>}
                    <div className="lp-sub">{eur(p.minimumBedrag) ? `min ${eur(p.minimumBedrag)}` : 'geen minimum'}</div>
                  </td>
                  <td className="lp-acties">
                    <button type="button" className="st-icon-btn" title="Wijzigen" onClick={() => setVenster({ bestaand: p })}><IconEdit size={14} /></button>
                    <button
                      type="button" className="st-icon-btn danger" title="Verwijderen" disabled={verwijder.isPending}
                      onClick={() => { if (window.confirm(`Prijs van ${p.leverancierNaam} verwijderen?`)) verwijder.mutate(p) }}
                    ><IconTrash size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <button type="button" className="lp-erbij" onClick={() => setVenster({})}>
        + {kolom === 'leverancier' ? 'Leverancier koppelen' : 'Prijs toevoegen'}
      </button>
      {venster && <PrijsVenster bestaand={venster.bestaand} keuze={keuze} onSluit={() => setVenster(null)} />}
    </div>
  )
}
