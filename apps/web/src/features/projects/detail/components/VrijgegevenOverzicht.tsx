import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { IconX } from '@tabler/icons-react'
import type { ProductieOrder, Project } from '@stockmanager/shared'
import { materiaalPlanApi, type OrderMateriaal } from '../../../../api/materiaal-plan'
import '../../../../components/materiaal/materiaal.css'

const dag = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}` : '—')
const OPEN = ['te_bestellen', 'aangevraagd', 'buffer']

type Stand = { tekst: string; klasse: 'ok' | 'warn' | 'dgr' | ''; detail: string }

/** Wat er met het materiaal van één order aan de hand is, in woorden. */
function materiaalVan(o: ProductieOrder, m: OrderMateriaal | undefined): Stand {
  if (!m || !m.nodig) return { tekst: 'geen materiaal nodig', klasse: '', detail: '—' }
  const res = m.gereserveerd.length ? `${m.gereserveerd.length} ${m.gereserveerd.length === 1 ? 'staaf' : 'staven'} gereserveerd` : ''
  const open = m.bestelRegels.filter((r) => OPEN.includes(r.status))
  const besteld = m.bestelRegels.filter((r) => r.status === 'besteld')
  const tekort = [...open, ...besteld].map((r) => `${r.stuks} × ${Math.round(r.lengteMm)} mm`).join(', ')
  const detail = [res, tekort && `tekort ${tekort}`].filter(Boolean).join(' · ')
  if (open.length) return { tekst: 'tekort · nog niet besteld', klasse: 'dgr', detail }
  if (besteld.length) return { tekst: o.materiaalVerwacht ? `besteld · verwacht ${dag(o.materiaalVerwacht)}` : 'besteld · datum onbekend', klasse: 'warn', detail }
  return { tekst: 'gedekt', klasse: 'ok', detail: detail || 'uit voorraad' }
}

/**
 * Na in productie geven (2026-10-09): per order of het materiaal er is, en
 * wanneer de planning hem laat beginnen. Een tekort staat er rood in — het is
 * op de bestellijst gezet, maar nog niet besteld.
 */
export function VrijgegevenOverzicht({ project, orderIds, onSluit }: { project: Project; orderIds: string[]; onSluit: () => void }) {
  const navigate = useNavigate()
  const { data: stand, error } = useQuery({ queryKey: ['materiaal-stand', project.id], queryFn: () => materiaalPlanApi.stand(project.id) })
  const orders = project.productieOrders.filter((o) => orderIds.includes(o.id))
  const rijen = orders.map((o) => {
    const s = materiaalVan(o, stand?.find((x) => x.orderId === o.id))
    const data = o.stappen.map((x) => x.geplandDatum).filter((d): d is string => !!d).sort()
    const start = data[0] ?? null
    const eind = data[data.length - 1] ?? null
    const laat = !!(o.materiaalVerwacht && start && o.materiaalVerwacht > start)
    const leveringMis = !!(eind && project.levertijdDatum && eind > project.levertijdDatum)
    return { o, s, start, laat, leveringMis }
  })
  const tekort = rijen.some((r) => r.s.klasse === 'dgr' || r.s.klasse === 'warn')

  return (
    <div className="mk-overlay" onClick={onSluit}>
      <div className="mk-modal" style={{ height: 'auto', maxHeight: '86vh', width: 'min(1200px, 100%)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="In productie gegeven">
        <div className="mk-kop">
          <b>{project.id} · {orders.length} {orders.length === 1 ? 'order' : 'orders'} in productie gegeven</b>
          <span className="sub">materiaal en planning</span>
          <button type="button" className="st-icon-btn sluit" onClick={onSluit} aria-label="Sluiten"><IconX size={16} /></button>
        </div>
        <div className="mk-tabel" style={{ border: 0 }}>
          {error && <div className="hk-tekort" style={{ margin: 12 }}>De materiaalstand kon niet geladen worden: {(error as Error).message}</div>}
          <table>
            <thead><tr><th>Order</th><th>Artikel</th><th className="n">Aantal</th><th>Materiaal</th><th>Stand</th><th>Planning</th></tr></thead>
            <tbody>
              {rijen.map(({ o, s, start, laat, leveringMis }) => (
                <tr key={o.id} style={{ cursor: 'default' }}>
                  <td className="mono">{o.id}</td>
                  <td>{o.artikelNaam}</td>
                  <td className="n">{o.qty}</td>
                  <td className="dim">{s.detail}</td>
                  <td><span className={`vo-stand ${s.klasse}`}>{s.tekst}</span></td>
                  <td>
                    {start ? `start ${dag(start)}` : <span className="dim">nog niet ingepland</span>}
                    {laat && <span className="vo-stand dgr" style={{ marginLeft: 6 }}>materiaal na de start</span>}
                    {leveringMis && <span className="vo-stand dgr" style={{ marginLeft: 6 }}>haalt de levering niet</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mk-voet">
          <div className="som">
            {tekort
              ? 'Het tekort staat op de bestellijst en blijft rood in de meldingen tot het besteld is en op tijd binnenkomt.'
              : 'Al het materiaal is er. De planning heeft de orders ingepland.'}
          </div>
          {tekort && <button type="button" className="st-btn" onClick={() => { onSluit(); navigate('/bestellingen') }}>Naar Bestellingen</button>}
          <button type="button" className="st-btn primary" onClick={onSluit}>Begrepen</button>
        </div>
      </div>
    </div>
  )
}
