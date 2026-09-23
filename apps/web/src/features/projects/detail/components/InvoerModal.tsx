import { useState } from 'react'

interface Props {
  titel: string
  /** Boven het veld: waarom dit gevraagd wordt en wat ermee gebeurt. */
  uitleg: string
  label: string
  soort: 'tekst' | 'aantal'
  /** Alleen bij 'aantal': de bovengrens, met de eenheid erachter. */
  max?: number
  eenheid?: string
  start?: string
  knop: string
  onBevestig: (waarde: string) => void
  onSluit: () => void
}

/**
 * Het dialoogje dat om één ding vraagt: een reden (§4.2) of een aantal.
 *
 * Bewust geen Mantine `Modal`: die brengt zijn eigen tokens mee en dan staat er
 * midden op deze pagina een venster dat uit een andere app komt.
 *
 * Een reden is verplicht en minimaal 3 tekens — een project dat stilligt zonder
 * uitleg levert over een maand alleen maar vragen op. Dezelfde eis staat in
 * `ProjectStatusStopSchema` op de server; hier zie je hem vóór het versturen.
 */
export function InvoerModal({
  titel,
  uitleg,
  label,
  soort,
  max,
  eenheid,
  start = '',
  knop,
  onBevestig,
  onSluit,
}: Props) {
  const [waarde, setWaarde] = useState(start)

  const fout =
    soort === 'tekst'
      ? waarde.trim().length < 3
        ? 'Vul minstens 3 tekens in.'
        : null
      : (() => {
          const n = Number(waarde.replace(',', '.'))
          if (!Number.isFinite(n) || n < 0) return 'Vul een geldig aantal in.'
          if (max !== undefined && n > max) return `Niet meer dan ${max} ${eenheid ?? ''}`.trim()
          return null
        })()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.35)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 300,
      }}
      onClick={onSluit}
    >
      <div
        className="pdv2-card"
        style={{ width: 420, background: 'var(--bg2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pdv2-card-head">
          <h2>{titel}</h2>
        </div>
        <div className="pdv2-card-body">
          <p style={{ margin: '0 0 9px', fontSize: 11.5, color: 'var(--text2)' }}>{uitleg}</p>
          <div className="pdv2-veld">
            <label htmlFor="pdv2-invoer">{label}</label>
            {soort === 'tekst' ? (
              <textarea
                id="pdv2-invoer"
                autoFocus
                value={waarde}
                onChange={(e) => setWaarde(e.currentTarget.value)}
              />
            ) : (
              <input
                id="pdv2-invoer"
                autoFocus
                inputMode="decimal"
                value={waarde}
                onChange={(e) => setWaarde(e.currentTarget.value)}
              />
            )}
            {fout && (
              <div className="hint" style={{ color: 'var(--dgr)' }}>
                {fout}
              </div>
            )}
            {!fout && soort === 'aantal' && max !== undefined && (
              <div className="hint">
                maximaal {max} {eenheid}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 7,
            justifyContent: 'flex-end',
            padding: '0 10px 10px',
          }}
        >
          <button type="button" className="pdv2-btn" onClick={onSluit}>
            Annuleren
          </button>
          <button
            type="button"
            className="pdv2-btn primair"
            disabled={Boolean(fout)}
            onClick={() => onBevestig(waarde.trim())}
          >
            {knop}
          </button>
        </div>
      </div>
    </div>
  )
}
