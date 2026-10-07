import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { BestelRegel, Prijsaanvraag, PrijsaanvraagLeverancier } from '@stockmanager/shared'
import { prijsaanvragenApi } from '../../../api/bestellingen'
import { meldFout } from '../../../utils/fout-melding-toon'
import { toonDocument } from '../../../features/projects/detail/lib/toon-document'
import { prijsaanvraagBestandsnaam, prijsaanvraagPdf } from '../lib/prijsaanvraag-document'
import { AntwoordVenster } from './AntwoordVenster'
import { useAanvraagVersturen } from './useAanvraagVersturen'
import { aantalTekst, datum } from './bestel-tekst'

/**
 * Prijsaanvragen (2026-10-06): per aanvraag de leveranciers, wanneer hij aan
 * elk verstuurd is en hoeveel regels ze beantwoord hebben.
 */
export function PrijsaanvragenTab({ aanvragen, regels, open }: { aanvragen: Prijsaanvraag[]; regels: BestelRegel[]; open: string | null }) {
  const qc = useQueryClient()
  const { klaarzetten, dialoog } = useAanvraagVersturen(regels)
  const [antwoord, setAntwoord] = useState<{ a: Prijsaanvraag; l: PrijsaanvraagLeverancier } | null>(null)
  const weg = useMutation({
    mutationFn: (a: Prijsaanvraag) => prijsaanvragenApi.remove(a.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prijsaanvragen'] }); qc.invalidateQueries({ queryKey: ['bestel-regels'] }); qc.invalidateQueries({ queryKey: ['inkoop'] }) },
    onError: (e, a) => meldFout({ actie: `${a.id} verwijderen`, fout: e, gevolg: 'De aanvraag staat er nog.' }),
  })

  if (aanvragen.length === 0) return <div className="st-empty">Nog geen prijsaanvragen. Kies regels bij "Te bestellen" en druk op Prijsaanvraag maken.</div>

  return (
    <div className="bs-aanvragen">
      {aanvragen.map((a) => {
        const verstuurd = a.leveranciers.filter((l) => l.verzondenOp).length
        const eigen = regels.filter((r) => a.regelIds.includes(r.id))
        return (
          <section key={a.id} className="bs-kaart" data-open={open === a.id}>
            <div className="bs-kaart-kop">
              <span className="cell-mono cell-strong">{a.id}</span>
              <span className={`st-badge ${verstuurd === 0 ? '' : verstuurd === a.leveranciers.length ? 'ok' : 'warn'}`}>
                <span className="dot" />{verstuurd === 0 ? 'Concept' : verstuurd === a.leveranciers.length ? 'Verstuurd' : `Verstuurd aan ${verstuurd} van ${a.leveranciers.length}`}
              </span>
              <span className="bs-sub">{datum(a.createdAt)} · {a.createdBy} · {a.regelIds.length} regel{a.regelIds.length === 1 ? '' : 's'}</span>
              <span style={{ flex: 1 }} />
              {verstuurd === 0 && (
                <button type="button" className="st-btn ghost sm" onClick={() => { if (window.confirm(`${a.id} verwijderen? Er is nog niets verstuurd.`)) weg.mutate(a) }}>Verwijderen</button>
              )}
            </div>
            <div className="bs-sub" style={{ margin: '0 0 8px' }}>{eigen.map((r) => `${r.materiaal} (${aantalTekst(r)})`).join(' · ')}</div>
            <table className="st-tbl bs-tbl">
              <thead><tr><th>Leverancier</th><th>E-mail</th><th>Verstuurd</th><th>Antwoord</th><th /></tr></thead>
              <tbody>
                {a.leveranciers.map((l) => {
                  const n = a.antwoorden.filter((x) => x.leverancierId === l.leverancierId).length
                  return (
                    <tr key={l.leverancierId}>
                      <td className="cell-strong">{l.naam}</td>
                      <td>{l.email ?? <span className="bs-waarschuw">geen e-mailadres</span>}</td>
                      <td className="cell-mono">{l.verzondenOp ? datum(l.verzondenOp) : <span className="cell-muted">nog niet</span>}</td>
                      <td>{n === 0 ? <span className="cell-muted">nog geen</span> : `${n} van ${a.regelIds.length} regels`}</td>
                      <td className="bs-acties">
                        <button type="button" className="st-btn ghost sm" onClick={() => toonDocument(`${a.id} openen`, () => prijsaanvraagPdf(a, l, regels), { titel: `Prijsaanvraag ${a.id} — ${l.naam}`, bestandsnaam: prijsaanvraagBestandsnaam(a, l) })}>Pdf</button>
                        <button type="button" className={`st-btn sm${l.verzondenOp ? ' ghost' : ' primary'}`} onClick={() => klaarzetten(a, l)}>{l.verzondenOp ? 'Opnieuw versturen' : 'Versturen'}</button>
                        <button type="button" className="st-btn sm" onClick={() => setAntwoord({ a, l })}>{n === 0 ? 'Antwoord invullen' : 'Antwoord wijzigen'}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
      {dialoog}
      {antwoord && <AntwoordVenster aanvraag={antwoord.a} leverancier={antwoord.l} regels={regels} onSluit={() => setAntwoord(null)} />}
    </div>
  )
}
