import type { Project, ProductieOrder, ProductieStap } from '@stockmanager/shared'
import { Card } from '../components/Card'
import { datum, dagenTot } from '../lib/format'

const BRON =
  'Volgorde, machine en „niet eerder dan" komen uit de opdracht; geplande datum en ' +
  'wachtrijpositie komen uit de planner. Hier meld je alleen stappen gereed.'

function orderPill(o: ProductieOrder) {
  if (o.status === 'gereed') return { tekst: 'Gereed', kleur: 'ok' }
  if (o.status === 'in_productie') return { tekst: 'In productie', kleur: 'accent' }
  return { tekst: 'Gepland', kleur: '' }
}

function stapPill(s: ProductieStap) {
  if (s.gereedOp) return { tekst: 'Gereed', kleur: 'ok' }
  const n = dagenTot(s.notBefore)
  if (n !== null && n > 0) return { tekst: 'Wacht op materiaal', kleur: 'warn' }
  return { tekst: 'Gepland', kleur: '' }
}

/** De wachtreden op de orderkop: de eerste stap die nog op materiaal wacht. */
function wachtReden(o: ProductieOrder): string | null {
  for (const s of o.stappen) {
    if (s.gereedOp || !s.notBefore) continue
    const n = dagenTot(s.notBefore)
    if (n !== null && n > 0) return `niet eerder dan ${datum(s.notBefore)} — materiaal onderweg`
  }
  return null
}

function OrderBlok({ order }: { order: ProductieOrder }) {
  const gereed = order.stappen.filter((s) => s.gereedOp).length
  const pill = orderPill(order)
  const wacht = wachtReden(order)

  return (
    <div>
      <div
        className="pdv2-card-head"
        style={{ background: 'var(--alt)', borderTop: '1px solid var(--border)' }}
      >
        <span className="mono" style={{ fontWeight: 600 }}>
          {order.id}
        </span>
        <span style={{ fontWeight: 600 }}>{order.artikelNaam}</span>
        <span className="pdv2-count">
          {order.qty} {order.eenheid}
        </span>
        <span className={`pdv2-pill ${pill.kleur}`}>{pill.tekst}</span>
        {wacht && (
          <span style={{ fontSize: 10.5, color: 'var(--warn)' }}>⏱ {wacht}</span>
        )}
        <span className="pdv2-spacer" />
        <span className="mono" style={{ fontSize: 11 }}>
          {gereed}/{order.stappen.length}
        </span>
        <span className="pdv2-meter" style={{ width: 96, marginTop: 0 }}>
          <i
            className={gereed === order.stappen.length ? 'ok' : ''}
            style={{
              width: order.stappen.length ? `${(gereed / order.stappen.length) * 100}%` : '0%',
            }}
          />
        </span>
      </div>

      <table className="pdv2-tbl">
        <thead>
          <tr>
            <th style={{ width: 30 }}>#</th>
            <th>Stap</th>
            <th style={{ width: 152 }}>Machine</th>
            <th style={{ width: 92 }}>Gepland</th>
            <th style={{ width: 68 }}>Wachtrij</th>
            <th style={{ width: 100 }}>Gereed op</th>
            <th style={{ width: 68 }}>Door</th>
            <th style={{ width: 120 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {order.stappen.map((s) => {
            const pill = stapPill(s)
            // Een geplande datum die door een notBefore naar achteren geduwd is
            // krijgt nadruk: dat is de enige plek waar de planner overruled is.
            const geduwd =
              Boolean(s.notBefore) &&
              Boolean(s.geplandDatum) &&
              String(s.notBefore) > String(s.geplandDatum)
            return (
              <tr key={s.id}>
                <td className="mono">{s.volgorde}</td>
                <td>{s.naam}</td>
                <td>{s.geplandMachine ?? s.machine ?? '—'}</td>
                <td
                  className="mono"
                  style={geduwd ? { color: 'var(--warn)', fontWeight: 600 } : undefined}
                >
                  {datum(s.geplandDatum)}
                </td>
                <td className="num">{s.queuePosition ?? '—'}</td>
                <td className="mono">{datum(s.gereedOp)}</td>
                <td>{s.gereedDoor ?? '—'}</td>
                <td>
                  <span className={`pdv2-pill ${pill.kleur}`}>{pill.tekst}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface Props {
  project: Project
  geblokkeerd: boolean
  onPlanner: () => void
  onAfmelden: () => void
}

/**
 * §5.4. Planning gebeurt niet op dit scherm: `geplandDatum`, `geplandMachine`
 * en `queuePosition` zijn hier alleen-lezen. De enige schrijfactie is
 * gereedmelden.
 */
export function ProductieTab({ project, geblokkeerd, onPlanner, onAfmelden }: Props) {
  const orders = project.productieOrders
  const gereed = orders.reduce((n, o) => n + o.stappen.filter((s) => s.gereedOp).length, 0)
  const totaal = orders.reduce((n, o) => n + o.stappen.length, 0)

  if (orders.length === 0) {
    return (
      <Card titel="Productie">
        <div className="pdv2-empty">
          Ontstaat uit de regels van de geaccepteerde offerte. Per regel komt er één
          productieorder; de bewerkingen van die regel worden de stappen.
        </div>
      </Card>
    )
  }

  return (
    <Card
      titel="Productie"
      teller={`${orders.length} orders · ${gereed} van ${totaal} stappen gereed`}
      plat
      bron={BRON}
      acties={
        <>
          <span className="pdv2-pill">planning uit planner</span>
          <button type="button" className="pdv2-btn s" onClick={onPlanner}>
            Openen in planner
          </button>
          <button
            type="button"
            className="pdv2-btn s"
            onClick={onAfmelden}
            disabled={geblokkeerd}
          >
            Stap afmelden
          </button>
        </>
      }
    >
      {orders.map((o) => (
        <OrderBlok order={o} key={o.id} />
      ))}
    </Card>
  )
}
