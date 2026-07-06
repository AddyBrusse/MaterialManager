import { useNavigate } from 'react-router-dom'
import type { TodoAlert } from '../../utils/todoAlerts'

interface Props {
  alerts: TodoAlert[]
  onConvert: (alert: TodoAlert) => void
}

export function TodoAlerts({ alerts, onConvert }: Props) {
  const navigate = useNavigate()
  if (alerts.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '.04em', color: 'var(--text-3)', marginBottom: 8,
        }}
      >
        Signaleringen ({alerts.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alerts.map(a => (
          <div key={a.key} className="prj-off-card">
            <div className="prj-off-hd" style={{ gap: 10, cursor: a.linkTo ? 'pointer' : 'default' }}
              onClick={() => a.linkTo && navigate(a.linkTo)}>
              <span className={`st-badge ${a.severity === 'high' ? 'danger' : 'warn'}`} style={{ fontSize: 10.5 }}>
                <span className="dot" />
              </span>
              <span style={{ flex: 1, fontSize: 13 }}>{a.title}</span>
              <button
                className="st-btn xs ghost"
                onClick={e => { e.stopPropagation(); onConvert(a) }}
              >
                Zet als taak
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
