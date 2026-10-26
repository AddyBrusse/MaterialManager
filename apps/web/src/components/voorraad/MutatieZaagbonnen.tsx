import { Link } from 'react-router-dom'
import type { ZaagReservation } from '../../api/reservations'
import { fmm } from './weergave'

/**
 * Waarom deze mutatie niet doorgaat (2026-10-19): de staaf zakt onder wat er
 * vastligt. Al zichtbaar tijdens het intypen, met de zaagbonnen en de twee
 * plekken waar je het oplost; de knop zegt het bij klikken nog eens.
 */
export function MutatieZaagbonnen({ reden, bonnen }: { reden: string; bonnen: ZaagReservation[] }) {
  return (
    <div data-mutatie-geweigerd style={{ border: '1px solid var(--warning)', background: 'var(--warning-soft)', borderRadius: 6, padding: '10px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: 'var(--warning)' }}>Deze mutatie kan zo niet</div>
      <div style={{ marginTop: 2 }}>{reden}</div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
        {bonnen.map((b) => (
          <li key={b.id}>
            <span className="cell-mono cell-strong">{b.calculatieNr || '—'}</span>
            {' · '}{fmm(b.sawLength)} vast{b.machine ? ` · ${b.machine}` : ''}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
        <Link to="/zaagflow">Naar Zaagflow</Link>
        <Link to="/reserveringen">Naar Reserveringen</Link>
      </div>
    </div>
  )
}
