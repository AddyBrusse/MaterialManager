import type { ReactNode } from 'react'

interface Props {
  titel: string
  /** Wat er gaat gebeuren, en wat níet — vóór iemand op de knop drukt. */
  children: ReactNode
  knop: string
  /** Rood in plaats van blauw: het is niet terug te draaien. */
  gevaar?: boolean
  onBevestig: () => void
  onSluit: () => void
}

/**
 * Een vraag om bevestiging, in dezelfde vorm als `InvoerModal`.
 *
 * Voor handelingen die niet terug te draaien zijn (een concept verwijderen) of
 * die de klant raken (een verstuurde versie intrekken). De tekst noemt wat er
 * weggaat — versie, regels, bedrag — zodat niemand de verkeerde rij bevestigt.
 */
export function BevestigModal({ titel, children, knop, gevaar, onBevestig, onSluit }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titel}
      className="pdv2-modal-achter"
      onClick={onSluit}
      onKeyDown={(e) => e.key === 'Escape' && onSluit()}
    >
      <div className="pdv2-card pdv2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pdv2-card-head">
          <h2>{titel}</h2>
        </div>
        <div className="pdv2-card-body pdv2-modal-tekst">{children}</div>
        <div className="pdv2-modal-knoppen">
          <button type="button" className="pdv2-btn" onClick={onSluit} autoFocus>
            Annuleren
          </button>
          <button
            type="button"
            className={`pdv2-btn ${gevaar ? 'gevaar' : 'primair'}`}
            onClick={onBevestig}
          >
            {knop}
          </button>
        </div>
      </div>
    </div>
  )
}
