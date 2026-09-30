import type { ProductieOrder, ProductieStap } from '@stockmanager/shared'
import { datum, dagenTot } from '../../lib/format'

function stapPill(s: ProductieStap) {
  if (s.gereedOp) return { tekst: 'Gereed', kleur: 'ok' }
  const n = dagenTot(s.notBefore)
  if (n !== null && n > 0) return { tekst: 'Wacht op materiaal', kleur: 'warn' }
  return { tekst: 'Gepland', kleur: '' }
}

/** De stappen van één order: wat er gepland staat, en gereed melden per stap. */
export function StappenTabel({
  order,
  geblokkeerd,
  onStap,
}: {
  order: ProductieOrder
  geblokkeerd: boolean
  onStap: (orderId: string, stapId: string, gereed: boolean) => void
}) {
  return (
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
        <th style={{ width: 92 }} />
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
            <td>
              <button
                type="button"
                className={`pdv2-btn s ${s.gereedOp ? '' : 'primair'}`}
                disabled={geblokkeerd}
                onClick={() => onStap(order.id, s.id, !s.gereedOp)}
              >
                {s.gereedOp ? 'Intrekken' : 'Gereed'}
              </button>
            </td>
          </tr>
        )
      })}
    </tbody>
  </table>
  )
}
