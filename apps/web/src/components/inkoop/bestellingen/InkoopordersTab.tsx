import { useState } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { openStuks, type Inkooporder, type InkooporderRegel } from '@stockmanager/shared'
import { toonDocument } from '../../../features/projects/detail/lib/toon-document'
import { ExootLabel } from '../ExootLabel'
import { inkooporderBestandsnaam, inkooporderPdf } from '../lib/inkooporder-document'
import { OntvangstVenster } from './OntvangstVenster'
import { useInkoopActies } from './useInkoopActies'
import { datum, eur, mm } from './bestel-tekst'

const STATUS = { concept: ['Concept', ''], verzonden: ['Verstuurd', 'info'], vervallen: ['Vervallen', 'danger'] } as const

function binnenTekst(o: Inkooporder) {
  const tot = o.regels.reduce((t, r) => t + r.stuks, 0)
  const binnen = o.regels.reduce((t, r) => t + r.ontvangenStuks, 0)
  return binnen === 0 ? null : binnen >= tot ? 'helemaal binnen' : `${binnen} van ${tot} stuks binnen`
}

/**
 * Inkooporders (2026-10-06, deel 3b): per leverancier, met per regel wat er al
 * binnen is. Een concept pas je nog aan; verstuurd ligt vast.
 */
export function InkoopordersTab({ orders }: { orders: Inkooporder[] }) {
  const acties = useInkoopActies()
  const [ontvang, setOntvang] = useState<{ o: Inkooporder; r: InkooporderRegel } | null>(null)
  const [toonVervallen, setToonVervallen] = useState(false)
  const zichtbaar = orders.filter((o) => toonVervallen || o.status !== 'vervallen')
  const vervallen = orders.length - orders.filter((o) => o.status !== 'vervallen').length

  if (orders.length === 0) return <div className="st-empty">Nog geen inkooporders. Kies per regel een leverancier bij Vergelijken en druk daar op Inkooporders maken.</div>

  return (
    <div className="bs-aanvragen">
      {vervallen > 0 && (
        <label className="bs-sub" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={toonVervallen} onChange={(e) => setToonVervallen(e.target.checked)} /> ook ingetrokken orders tonen ({vervallen})
        </label>
      )}
      {zichtbaar.map((o) => {
        const [label, cls] = STATUS[o.status]
        const binnen = binnenTekst(o)
        return (
          <section key={o.id} className="bs-kaart" data-vervallen={o.status === 'vervallen'}>
            <div className="bs-kaart-kop">
              <span className="cell-mono cell-strong">{o.id}</span>
              <span className={`st-badge ${cls}`}><span className="dot" />{label}</span>
              <span className="cell-strong">{o.leverancierNaam}</span>
              <span className="bs-sub">
                {o.verzondenOp ? `verstuurd ${datum(o.verzondenOp)}` : `aangemaakt ${datum(o.createdAt)} · ${o.createdBy}`}
                {binnen ? ` · ${binnen}` : ''}
                {o.referentie ? ` · op ${o.referentie}` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" className="st-btn ghost sm" onClick={() => toonDocument(`${o.id} openen`, () => inkooporderPdf(o), { titel: `Inkooporder ${o.id}`, bestandsnaam: inkooporderBestandsnaam(o) })}>Pdf</button>
              {o.status === 'concept' && <button type="button" className="st-btn ghost sm" onClick={() => acties.verwijder(o)}>Verwijderen</button>}
              {o.status === 'concept' && <button type="button" className="st-btn primary sm" onClick={() => acties.versturen(o)}>Versturen</button>}
              {o.status === 'verzonden' && <button type="button" className="st-btn ghost sm" onClick={() => acties.intrekken(o)}>Intrekken</button>}
            </div>
            {o.status === 'vervallen' && <div className="bs-waarschuw" style={{ marginBottom: 6 }}>Ingetrokken {datum(o.vervallenOp)} door {o.vervallenDoor}: {o.vervallenReden}</div>}
            <table className="st-tbl bs-tbl">
              <thead><tr><th>Ref.</th><th>Materiaal</th><th className="cell-num">Aantal</th><th>Prijs</th><th className="cell-num">Totaal</th><th>Levertijd</th><th>Ontvangen</th><th /></tr></thead>
              <tbody>
                {o.regels.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-mono">{r.referentie}</td>
                    <td>
                      <div className="cell-strong">{r.materiaal} {r.exoot && <ExootLabel compact />}</div>
                      {r.projectId && <div className="bs-sub">voor {r.projectId}{r.artikelNaam ? ` · ${r.artikelNaam}` : ''}</div>}
                    </td>
                    <td className="cell-num cell-mono">{r.stuks} × {mm(r.lengteMm)}</td>
                    <td className="bs-sub">{r.uitleg}</td>
                    <td className="cell-num cell-mono">{eur(r.totaal)}</td>
                    <td>{r.levertijdDagen != null ? `${r.levertijdDagen} werkdagen` : '—'}</td>
                    <td className="cell-mono">{r.ontvangenStuks} / {r.stuks}</td>
                    <td className="bs-acties">
                      {o.status === 'verzonden' && openStuks(r) > 0 && <button type="button" className="st-btn sm" onClick={() => setOntvang({ o, r })}>Ontvangen</button>}
                      {o.status === 'concept' && <button type="button" className="st-icon-btn danger" title="Van deze order halen" onClick={() => acties.regelEraf(o, r.id)}><IconTrash size={14} /></button>}
                    </td>
                  </tr>
                ))}
                <tr><td colSpan={4} className="ta-r bs-sub">Totaal excl. btw</td><td className="cell-num cell-mono cell-strong">{eur(o.totaal)}</td><td colSpan={3} /></tr>
              </tbody>
            </table>
          </section>
        )
      })}
      {acties.dialoog}
      {ontvang && <OntvangstVenster order={ontvang.o} regel={ontvang.r} onSluit={() => setOntvang(null)} />}
    </div>
  )
}
