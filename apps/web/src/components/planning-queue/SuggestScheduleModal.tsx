import { Modal } from '@mantine/core'
import type { SuggestOptionResult } from '../../utils/planningQueueUtils'

interface SuggestScheduleModalProps {
  opened: boolean
  onClose: () => void
  options: SuggestOptionResult[]
  baseline: { bezettingPct: number; achterstand: number; gemDoorlooptijdDagen: number }
  onApply: (option: SuggestOptionResult) => void
}

// Real, live-computed alternatives (see computeSuggestOptions in
// planningQueueUtils.ts) — three well-known single-machine heuristics
// (SPT / EDD / LPT) reordering each machine's own queue, then run through
// the same whole-shop scheduler used everywhere else so the comparison
// numbers are genuine, not placeholders.
export function SuggestScheduleModal({ opened, onClose, options, baseline, onApply }: SuggestScheduleModalProps) {
  function apply(option: SuggestOptionResult) {
    onApply(option)
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Voorgestelde schema's" size="960px" centered>
      <div className="wq-suggest-grid">
        {options.map(opt => (
          <div key={opt.objective} className="wq-suggest-card">
            <div>
              <div className="t">{opt.title}</div>
              <div className="d">{opt.desc}</div>
            </div>
            <div className="wq-suggest-metric">
              <span className="k">Gem. doorlooptijd</span>
              <span>
                <span className="old">{baseline.gemDoorlooptijdDagen} d</span>
                <span className={`new ${opt.metrics.gemDoorlooptijdDagen <= baseline.gemDoorlooptijdDagen ? 'better' : 'worse'}`}>
                  {opt.metrics.gemDoorlooptijdDagen} d
                </span>
              </span>
            </div>
            <div className="wq-suggest-metric">
              <span className="k">Achterstand</span>
              <span>
                <span className="old">{baseline.achterstand}</span>
                <span className={`new ${opt.metrics.achterstand <= baseline.achterstand ? 'better' : 'worse'}`}>
                  {opt.metrics.achterstand}
                </span>
              </span>
            </div>
            <div className="wq-suggest-metric">
              <span className="k">Bezetting</span>
              <span>
                <span className="old">{baseline.bezettingPct}%</span>
                <span className={`new ${opt.metrics.bezettingPct >= baseline.bezettingPct ? 'better' : 'worse'}`}>
                  {opt.metrics.bezettingPct}%
                </span>
              </span>
            </div>
            <button className="btn primary" onClick={() => apply(opt)}>Toepassen</button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
