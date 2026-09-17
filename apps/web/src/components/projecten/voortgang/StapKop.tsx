// De kop van een kolomgroep: naam, kerngetal, en de handeling die erbij hoort.
//
// De kolomgroepen wáren al de stappen, maar dat zag je niet — het waren gewoon
// kopjes. Nu draagt elke groep zijn eigen volgende handeling, en leest de
// kopregel als het traject zelf: bestellen → maken → leveren → innen.
import type { StapStand } from '@stockmanager/shared'

const KNOP_STIJL: Record<StapStand, React.CSSProperties> = {
  // Blauw = de stap die nú aan de beurt is. Er is er altijd precies één, dus
  // je hoeft niet te kiezen waar je begint.
  nu: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' },
  klaar: {
    background: 'var(--success-soft)', borderColor: 'rgba(17,122,69,.22)',
    color: 'var(--success)',
  },
  rust: { background: 'var(--bg-2)', borderColor: 'var(--border-strong)', color: 'var(--text)' },
  uit: {
    background: 'rgba(15,17,22,.03)', borderColor: 'var(--border)',
    color: 'var(--text-4)', cursor: 'not-allowed',
  },
}

interface Props {
  naam: string
  /** Dicht = alleen de kop, de kolommen eronder zijn verborgen. De chevron
   *  wijst dan naar rechts, zoals in het ontwerp. */
  dicht?: boolean
  onKlap?: () => void
  /** Het kerngetal van deze stap, naast de naam. */
  samenvatting?: string
  stand: StapStand
  knopTekst: string
  onClick?: () => void
  /** Uitleg bij een uitgeschakelde knop: waarom kan dit nog niet. */
  titel?: string
  span: number
  tint: string
}

export function StapKop({
  naam, samenvatting, stand, knopTekst, onClick, titel, span, tint, dicht, onKlap,
}: Props) {
  const uit = stand === 'uit'
  const chevron = dicht ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'
  return (
    <th
      colSpan={span}
      style={{
        background: tint, padding: '7px 10px 8px', textAlign: 'left',
        verticalAlign: 'top', borderBottom: '1px solid var(--border)', overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onKlap}
        title={dicht ? `${naam} openklappen` : `${naam} inklappen`}
        style={{
          display: 'flex', alignItems: 'center', fontSize: 10.5, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-2)',
          whiteSpace: 'nowrap', background: 'none', border: 0, padding: 0,
          cursor: onKlap ? 'pointer' : 'default', font: 'inherit',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.6" style={{ opacity: .55, marginRight: 5, flexShrink: 0 }}>
          <path d={chevron} />
        </svg>
        {naam}
        {samenvatting && (
          <span style={{
            fontWeight: 500, color: 'var(--text-4)', textTransform: 'none',
            letterSpacing: 0, fontSize: 11, marginLeft: 8,
          }}>
            {samenvatting}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={uit ? undefined : onClick}
        disabled={uit || !onClick}
        title={titel}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, height: 24,
          padding: '0 9px', marginTop: 6, borderRadius: 6, border: '1px solid',
          fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
          cursor: uit || !onClick ? 'default' : 'pointer',
          ...KNOP_STIJL[stand],
        }}
      >
        {stand === 'klaar' && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
        {knopTekst}
      </button>
    </th>
  )
}

/** De leeskop links boven Tekening/Artikel: zegt in één regel waarom de
 *  kolommen zo staan. Zonder die regel zijn het vier willekeurige groepen. */
export function StappenLabel() {
  return (
    <th
      colSpan={2}
      style={{
        background: 'var(--bg-2)', padding: '7px 10px 8px', textAlign: 'left',
        verticalAlign: 'top', borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{
        fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.05em', color: 'var(--text-4)',
      }}>
        Elke groep is een stap
      </span>
      {/* 9.5px: gemeten heeft deze regel op 10px 205 px nodig en is er 200
          beschikbaar, dus viel "innen" eraf. Het is een leeshint, geen data —
          die levert als eerste in. */}
      <div style={{
        display: 'flex', alignItems: 'center', marginTop: 8, height: 24,
        fontSize: 9.5, color: 'var(--text-4)', whiteSpace: 'nowrap', overflow: 'hidden',
      }}>
        bestellen → maken → leveren → innen
      </div>
    </th>
  )
}
