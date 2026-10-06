/**
 * Label voor een exoot (2026-10-06): materiaal buiten het vaste assortiment,
 * op maat besteld voor één klant. Met de klant erbij als die bekend is, want
 * daar hoort het bij.
 */
export function ExootLabel({ klant, compact }: { klant?: { naam: string } | null; compact?: boolean }) {
  return (
    <span
      className="st-badge exoot"
      title={`Exoot: op maat besteld${klant ? ` voor ${klant.naam}` : ''}, niet uit het vaste assortiment`}
    >
      EXOOT{!compact && klant ? ` · ${klant.naam}` : ''}
    </span>
  )
}
