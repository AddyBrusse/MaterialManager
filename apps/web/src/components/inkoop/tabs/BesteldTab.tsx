import { useState } from 'react'
import { normaliseerMateriaalNummer, isMateriaalNummer, type InkoopOverzicht, type InkoopOverzichtRegel } from '@stockmanager/shared'
import { aantalTekst } from '../bestellingen/bestel-tekst'
import { NodigCel, VoorCel, StandChip, ddmm, ddmmjjjj, lokaleDag } from '../overzicht/tekst'

/** De regel bij een getypt labelnummer, of waarom er geen is. */
export function zoekOpNummer(ov: InkoopOverzicht, invoer: string): { regel: InkoopOverzichtRegel | null; melding: string | null } {
  const nr = normaliseerMateriaalNummer(invoer)
  if (!isMateriaalNummer(nr)) return { regel: null, melding: invoer.trim() ? 'Een nummer is jaar + volgnummer, bijvoorbeeld 260042.' : null }
  const r = ov.regels.find((x) => x.order?.materiaalNummer === nr)
  if (!r) return { regel: null, melding: `Geen bestelling met nummer ${nr}.` }
  if (r.status === 'ontvangen') return { regel: null, melding: `${nr} is al helemaal binnen geboekt.` }
  return { regel: r, melding: null }
}

/**
 * Tab 4 · Besteld (2026-10-07): alles wat de deur uit is, nieuwste eerst, met
 * wanneer het binnen moet zijn en of dat op tijd is voor de productie. Typ het
 * nummer van het label om meteen binnen te boeken. Helemaal binnen = weg uit
 * deze lijst.
 */
export function BesteldTab({ ov, onOpen, onBinnen }: { ov: InkoopOverzicht; onOpen: (r: InkoopOverzichtRegel) => void; onBinnen: (r: InkoopOverzichtRegel) => void }) {
  const [nummer, setNummer] = useState('')
  const regels = ov.regels.filter((r) => r.status === 'besteld' && r.order?.status === 'verzonden')
    .sort((a, b) => (b.order!.verzondenOp ?? '').localeCompare(a.order!.verzondenOp ?? ''))
  const gevonden = zoekOpNummer(ov, nummer)
  const laat = regels.filter((r) => r.plan.stand === 'komt_te_laat').length

  return (
    <>
      <form className="ib-label" onSubmit={(e) => { e.preventDefault(); if (gevonden.regel) { onBinnen(gevonden.regel); setNummer('') } }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
          Nummer van het label
          <input value={nummer} onChange={(e) => setNummer(e.currentTarget.value)} placeholder="260042" inputMode="numeric" aria-describedby="ib-label-uitleg" autoComplete="off" />
        </label>
        <button type="submit" className="st-btn sm" style={{ background: 'var(--success)', color: '#fff', borderColor: 'transparent' }} disabled={!gevonden.regel}>Binnen boeken ↵</button>
        <span id="ib-label-uitleg" style={{ fontSize: 12, color: 'var(--text-2)', paddingBottom: 8 }}>
          {gevonden.regel ? <>Gevonden: <b>{gevonden.regel.materiaal}</b> · {aantalTekst(gevonden.regel)} · {gevonden.regel.order!.id} · {gevonden.regel.projectId ?? 'voorraad'}</>
            : gevonden.melding ?? 'Typ het nummer dat de leverancier op het materiaal plakte, of klik hieronder op Binnen boeken.'}
        </span>
      </form>
      <div className="ib-balk"><span>{regels.length} regel{regels.length === 1 ? '' : 's'} onderweg{laat ? ` · ${laat} komt te laat` : ''}</span><span style={{ flex: 1 }} /><span>nieuwste bestelling eerst</span></div>
      {regels.length === 0 ? <div className="ib-leeg">Er staat niets in bestelling.</div> : (
        <div className="ib-kaart">
          <table className="st-tbl ib-t" style={{ minWidth: 1120 }}>
            <thead>
              <tr><th>Besteld</th><th>Nummer · inkooporder</th><th>Materiaal</th><th>Voor</th><th>Verwacht binnen</th><th>Nodig voor productie</th><th>Prognose</th><th>Binnen</th><th /></tr>
            </thead>
            <tbody>
              {regels.map((r) => {
                const o = r.order!
                return (
                  <tr key={r.id} className="klik" data-stand={r.plan.stand} data-gevonden={gevonden.regel?.id === r.id} onClick={() => onOpen(r)}>
                    <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>{o.verzondenOp ? ddmm(lokaleDag(o.verzondenOp)) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><div className="ib-nummer">{o.materiaalNummer ?? o.referentie}</div><div className="ib-sub">{o.materiaalNummer ? `${o.id} · ` : ''}{o.leverancierNaam}</div></td>
                    <td style={{ whiteSpace: 'nowrap' }}><div className="cell-strong">{r.materiaal}{r.exoot && <span className="ib-exoot">EXOOT</span>}</div><div className="ib-sub cell-mono">{aantalTekst(r)}</div></td>
                    <td style={{ whiteSpace: 'nowrap' }}><VoorCel r={r} /></td>
                    <td>
                      <div className="cell-mono" style={{ whiteSpace: 'nowrap' }}>{r.plan.verwacht ? ddmmjjjj(r.plan.verwacht) : <span className="bs-waarschuw">onbekend</span>}</div>
                      <div className="ib-sub">{!r.plan.verwacht ? 'levertijd niet opgegeven' : o.verwachtAangepast ? 'doorgegeven door leverancier' : `besteld + ${r.leverancier?.levertijdDagen ?? 0} werkdagen`}</div>
                    </td>
                    <td><NodigCel r={r} /></td>
                    <td>{r.plan.stand === 'onderweg_op_tijd' && r.plan.verwacht && r.nodig.datum
                      ? <span className="ib-chip ok">op tijd · verwacht {ddmm(r.plan.verwacht)}</span>
                      : <StandChip r={r} />}</td>
                    <td className="cell-mono">{o.ontvangenStuks} / {r.stuks}</td>
                    <td className="bs-acties" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="st-btn sm" style={{ background: 'var(--success)', color: '#fff', borderColor: 'transparent' }} aria-label={`Binnen boeken: ${o.materiaalNummer ?? o.referentie}`} onClick={() => onBinnen(r)}>Binnen</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="ib-uitleg">Helemaal binnen geboekt? Dan verdwijnt de regel uit deze lijst. Deels binnen blijft staan met wat er nog open is. Klik een regel voor de geschiedenis, de leverdatum en intrekken.</div>
    </>
  )
}
