import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { waaromNietPrijzenAanvragen, type BestelBron, type BestelRegel, type InkoopOverzicht, type InkoopOverzichtRegel } from '@stockmanager/shared'
import { bestelRegelsApi } from '../../../api/bestellingen'
import { INKOOP_SLEUTELS } from '../../../api/inkooporders'
import { meldFout } from '../../../utils/fout-melding-toon'
import { Weigering } from '../../../utils/fout-melding'
import { aantalTekst, bronTekst } from '../bestellingen/bestel-tekst'
import { NodigCel, VoorCel } from '../overzicht/tekst'
import { LeveranciersKiezer } from './LeveranciersKiezer'
import { useAanvragenVersturen } from './useAanvragenVersturen'

/**
 * Tab 1 · Te bestellen (2026-10-07): alles wat besteld moet worden, uit een
 * opdracht of met de hand. Je zet leveranciers bij de regels en vraagt per
 * leverancier in één mail een prijs; daarna staan ze bij Open prijsaanvragen.
 */
export function TeBestellenTab({ ov, bestelRegels, onOpen, onBewerk }: {
  ov: InkoopOverzicht; bestelRegels: BestelRegel[]
  onOpen: (r: InkoopOverzichtRegel) => void; onBewerk: (r: BestelRegel) => void
}) {
  const qc = useQueryClient()
  const regels = ov.regels.filter((r) => r.status === 'te_bestellen')
    .sort((a, b) => (a.plan.uiterlijk ?? '9999').localeCompare(b.plan.uiterlijk ?? '9999'))
  const [gekozen, setGekozen] = useState<Set<string>>(new Set())
  const selectie = regels.filter((r) => gekozen.has(r.id))
  const naam = (id: string) => ov.leveranciers.find((l) => l.id === id)?.naam ?? 'onbekende leverancier'
  const ververs = () => { for (const k of INKOOP_SLEUTELS) qc.invalidateQueries({ queryKey: [k] }) }
  const versturen = useAanvragenVersturen(bestelRegels)

  const zet = useMutation({
    mutationFn: (leverancierIds: string[]) => bestelRegelsApi.zetLeveranciers({ regelIds: selectie.map((r) => r.id), leverancierIds, modus: 'vervang' }),
    onSuccess: ververs,
    onError: (e) => meldFout({ actie: 'Leveranciers bij de regels zetten', fout: e, gevolg: 'Er is niets veranderd.' }),
  })
  const weg = useMutation({
    mutationFn: ({ r, id }: { r: InkoopOverzichtRegel; id: string }) => bestelRegelsApi.update(r.id, { leverancierIds: r.leverancierIds.filter((x) => x !== id) }),
    onSuccess: ververs,
    onError: (e, { r }) => meldFout({ actie: `Leverancier weghalen bij ${r.materiaal}`, fout: e, gevolg: 'Hij staat er nog bij.' }),
  })

  const aanvragen = () => {
    const nee = waaromNietPrijzenAanvragen(selectie, ov.leveranciers)
    if (nee) { meldFout({ actie: 'Prijzen aanvragen', fout: new Weigering(nee), gevolg: 'Er is niets aangevraagd.' }); return }
    versturen.aanvragen(selectie.map((r) => r.id))
  }
  const vereis = (doe: () => void) => (selectie.length ? doe() : meldFout({ actie: 'Leveranciers toevoegen', fout: new Weigering('Vink eerst één of meer regels aan.'), gevolg: 'Er is niets veranderd.' }))
  // Aangevinkt in de kiezer: wie al bij álle gekozen regels staat.
  const bijAlle = selectie.length ? selectie[0].leverancierIds.filter((id) => selectie.every((r) => r.leverancierIds.includes(id))) : []
  const allesAan = regels.length > 0 && regels.every((r) => gekozen.has(r.id))
  const zetAan = (ids: string[], aan: boolean) => setGekozen((g) => { const n = new Set(g); for (const id of ids) aan ? n.add(id) : n.delete(id); return n })

  return (
    <>
      <div className="ib-balk">
        <span>{selectie.length} geselecteerd</span>
        <span style={{ flex: 1 }} />
        {selectie.length > 0
          ? <LeveranciersKiezer label="Leveranciers toevoegen" leveranciers={ov.leveranciers} al={bijAlle} aantal={selectie.length} onKies={(ids) => zet.mutate(ids)} />
          : <button type="button" className="st-btn sm" onClick={() => vereis(() => {})}>Leveranciers toevoegen ▾</button>}
        <button type="button" className="st-btn primary sm" disabled={versturen.bezig} onClick={aanvragen}>
          Prijzen aanvragen{selectie.length ? ` (${selectie.length})` : ''}
        </button>
      </div>
      {regels.length === 0 ? <div className="ib-leeg">Er staat niets te bestellen. Een exoot uit een opdracht of een tekort uit de materiaalselectie komt hier vanzelf; met de hand kan via "Materiaal toevoegen".</div> : (
        <div className="ib-kaart">
          <table className="st-tbl ib-t">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" aria-label="Alles selecteren" checked={allesAan} onChange={(e) => zetAan(regels.map((r) => r.id), e.currentTarget.checked)} /></th>
                <th>Materiaal</th><th>Voor</th><th>Aantal</th><th>Nodig voor productie</th><th>Leveranciers</th><th />
              </tr>
            </thead>
            <tbody>
              {regels.map((r) => (
                <tr key={r.id} data-aan={gekozen.has(r.id)} className="klik" onClick={() => onOpen(r)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={gekozen.has(r.id)} aria-label={`Selecteer ${r.materiaal}`} onChange={(e) => zetAan([r.id], e.currentTarget.checked)} /></td>
                  <td><div className="cell-strong">{r.materiaal}{r.exoot && <span className="ib-exoot">EXOOT</span>}</div><div className="ib-sub">{bronTekst(r.bron as BestelBron)}</div></td>
                  <td><VoorCel r={r} /></td>
                  <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>{aantalTekst(r)}</td>
                  <td>
                    <NodigCel r={r} />
                    {(r.plan.stand === 'nu_bestellen' || r.plan.stand === 'te_laat_besteld') && <div className="ib-sub dgr">{r.plan.tekst}</div>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {r.leverancierIds.length === 0 ? <span className="bs-waarschuw">nog geen leverancier</span> : (
                      <div className="ib-chips">
                        {r.leverancierIds.map((id) => (
                          <span key={id} className="ib-lchip">{naam(id)}<button type="button" aria-label={`${naam(id)} weghalen bij ${r.materiaal}`} onClick={() => weg.mutate({ r, id })}>×</button></span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="bs-acties" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="st-btn ghost sm" onClick={() => { const b = bestelRegels.find((x) => x.id === r.id); if (b) onBewerk(b) }}>Bewerken</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="ib-uitleg">Na "Prijzen aanvragen" krijgt elke leverancier één mail met alle regels die bij hem staan; de regels gaan naar <b>Open prijsaanvragen</b>.</div>
      {versturen.dialoog}
    </>
  )
}
