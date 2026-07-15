import { Modal } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { CascadeImpact } from '../../utils/planningQueueUtils'

interface CascadeConfirmModalProps {
  opened: boolean
  impact: CascadeImpact | null
  movedJobLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function CascadeConfirmModal({ opened, impact, movedJobLabel, onConfirm, onCancel }: CascadeConfirmModalProps) {
  if (!impact) return null
  const days = Math.round(impact.deltaDays * 10) / 10
  const sign = days > 0 ? '+' : ''

  return (
    <Modal opened={opened} onClose={onCancel} title="Deze wijziging raakt een andere machine" centered size="480px">
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <IconAlertTriangle size={20} color="var(--warning)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {movedJobLabel} verplaatsen schuift <strong>{impact.affectedJob.orderId}</strong> ({impact.affectedJob.artikel}) op{' '}
          <strong>{impact.affectedJob.machineNaam}</strong>, omdat deze stap pas kan starten nadat de verplaatste stap klaar is.
        </div>
      </div>

      <div className="wq-suggest-card" style={{ marginBottom: 16 }}>
        <div className="t">{impact.affectedJob.machineNaam}</div>
        <div className="wq-suggest-metric">
          <span className="k">{impact.affectedJob.orderId} — {impact.affectedJob.artikel}</span>
          <span className={`new ${days > 0 ? 'worse' : 'better'}`}>{sign}{days} dag{Math.abs(days) === 1 ? '' : 'en'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>Annuleren</button>
        <button className="btn primary" onClick={onConfirm}>Bevestig wijziging</button>
      </div>
    </Modal>
  )
}
