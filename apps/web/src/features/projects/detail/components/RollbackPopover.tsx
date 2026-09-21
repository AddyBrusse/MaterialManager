import type { TerugVM } from '../types'

/**
 * De uitklapper bij de terugdraaiknop (§4.3), 360 px boven de knop.
 *
 * Buiten deze popover is het slotje het enige signaal — het scherm zet geen
 * waarschuwingen in beeld die niemand gevraagd heeft.
 */
export function RollbackPopover({ terug, onSluit }: { terug: TerugVM; onSluit: () => void }) {
  const dicht = terug.blokkades.length > 0

  return (
    <div className="pdv2-pop" role="dialog" aria-label="Gevolgen van terugdraaien">
      <h3 className={dicht ? 'dicht' : ''}>{dicht ? 'Terugweg is dicht' : 'Dit gebeurt er'}</h3>

      {terug.blokkades.map((b) => (
        <div className="pdv2-pop-regel blok" key={b}>
          <span>✕</span>
          <span>{b}</span>
        </div>
      ))}
      {terug.gevolgen.map((g) => (
        <div className="pdv2-pop-regel" key={g}>
          <span>•</span>
          <span>{g}</span>
        </div>
      ))}

      <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" className="pdv2-btn s" onClick={onSluit}>
          Sluiten
        </button>
        {!dicht && (
          <button type="button" className="pdv2-btn s primair" disabled>
            Terugdraaien
          </button>
        )}
      </div>
    </div>
  )
}
