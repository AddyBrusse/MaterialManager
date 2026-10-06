import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconEdit, IconTrash } from '@tabler/icons-react'
import { prijslijstVoorRegel, waaromNietBestelRegelVerwijderen, type BestelRegel, type VergelijkData } from '@stockmanager/shared'
import { bestelRegelsApi } from '../../../api/bestellingen'
import { meldFout } from '../../../utils/fout-melding-toon'
import { Weigering } from '../../../utils/fout-melding'
import { ExootLabel } from '../ExootLabel'
import { BestelRegelVenster } from './BestelRegelVenster'
import { BestelStatusBadge, aantalTekst, bronTekst, datum, eur, kg } from './bestel-tekst'

/** Wie er voor deze regel in beeld is: met een prijs, of gevraagd. */
function leveranciersVan(r: BestelRegel, d: VergelijkData | undefined): string[] {
  if (!d) return []
  const ids = new Set([...prijslijstVoorRegel(d.prijzen, r, d.gelijk[r.id] ?? []).keys(), ...Object.keys(d.gevraagd[r.id] ?? {})])
  return d.leveranciers.filter((l) => ids.has(l.id)).map((l) => l.naam)
}

/**
 * Wat er besteld moet worden (2026-10-06). Ook wat al is aangevraagd staat
 * hier, met een vinkje: dat vergelijk je, en je mag het opnieuw aanvragen.
 */
export function TeBestellenTab({ regels, data, gekozen, onGekozen }: {
  regels: BestelRegel[]; data: VergelijkData | undefined; gekozen: Set<string>; onGekozen: (s: Set<string>) => void
}) {
  const qc = useQueryClient()
  const [wijzig, setWijzig] = useState<BestelRegel | null>(null)
  const verwijder = useMutation({
    mutationFn: async (r: BestelRegel) => {
      const reden = waaromNietBestelRegelVerwijderen(r)
      if (reden) throw new Weigering(reden)
      return bestelRegelsApi.remove(r.id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bestel-regels'] }),
    onError: (e, r) => meldFout({ actie: `${r.materiaal} van de bestellijst halen`, fout: e, gevolg: 'De regel staat er nog; er is niets verwijderd.' }),
  })

  const wissel = (id: string) => { const n = new Set(gekozen); if (n.has(id)) n.delete(id); else n.add(id); onGekozen(n) }
  const alles = regels.length > 0 && regels.every((r) => gekozen.has(r.id))

  if (regels.length === 0) {
    return <div className="st-empty">Niets te bestellen. Een exoot uit een opdracht, een tekort uit de materiaalselectie of iets onder de minimumvoorraad komt hier vanzelf; met de knop rechtsboven zet je er zelf iets op.</div>
  }
  return (
    <>
      <table className="st-tbl bs-tbl">
        <thead>
          <tr>
            <th className="col-checkbox"><span className="st-ck" data-on={alles} onClick={() => onGekozen(alles ? new Set() : new Set(regels.map((r) => r.id)))} /></th>
            <th>Materiaal</th>
            <th>Voor</th>
            <th className="cell-num">Aantal</th>
            <th>Nodig</th>
            <th>Leveranciers</th>
            <th>Gekozen</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {regels.map((r) => {
            const levs = leveranciersVan(r, data)
            return (
              <tr key={r.id} data-selected={gekozen.has(r.id)} onClick={() => wissel(r.id)}>
                <td className="col-checkbox"><span className="st-ck" data-on={gekozen.has(r.id)} /></td>
                <td>
                  <div className="cell-strong">{r.materiaal} {r.exoot && <ExootLabel compact />}</div>
                  <div className="bs-sub">{bronTekst(r.bron)} · {kg(r.kg)}{r.notitie ? ` · ${r.notitie}` : ''}</div>
                </td>
                <td>
                  {r.projectId ? <><div className="cell-mono">{r.projectId}</div><div className="bs-sub">{[r.klantNaam, r.artikelNaam].filter(Boolean).join(' · ')}</div></> : <span className="cell-muted">voorraad</span>}
                </td>
                <td className="cell-num cell-mono">{aantalTekst(r)}</td>
                <td className="cell-mono">{r.nodigVoor ? `vóór ${datum(r.nodigVoor)}` : '—'}</td>
                <td>{levs.length ? levs.join(', ') : <span className="bs-waarschuw">geen leverancier gekoppeld</span>}</td>
                <td>{r.keuze ? <><div>{r.keuze.leverancierNaam}</div><div className="bs-sub cell-mono">{eur(r.keuze.totaal)}</div></> : <span className="cell-muted">—</span>}</td>
                <td>
                  <BestelStatusBadge status={r.status} />
                  {r.aanvragen[0] && <div className="bs-sub">{r.aanvragen[0].id}{r.aanvragen[0].verzondenOp ? ` · ${datum(r.aanvragen[0].verzondenOp)}` : ' · nog niet verstuurd'}</div>}
                </td>
                <td className="bs-acties" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="st-icon-btn" title="Wijzigen" onClick={() => setWijzig(r)}><IconEdit size={14} /></button>
                  <button type="button" className="st-icon-btn danger" title="Van de bestellijst halen"
                    onClick={() => { if (window.confirm(`${r.materiaal} (${aantalTekst(r)}) van de bestellijst halen?`)) verwijder.mutate(r) }}>
                    <IconTrash size={14} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {wijzig && <BestelRegelVenster bestaand={wijzig} onSluit={() => setWijzig(null)} />}
    </>
  )
}
