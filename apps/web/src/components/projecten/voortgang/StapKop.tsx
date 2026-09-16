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

export function StapKop({ naam, samenvatting, stand, knopTekst, onClick, titel, span, tint }: Props) {
  const uit = stand === 'uit'
  return (
    <th
      colSpan={span}
      style={{
        background: tint, padding: '7px 10px 8px', textAlign: 'left',
        verticalAlign: 'top', borderBottom: '1px solid var(--border)', overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', fontSize: 10.5, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-2)',
        whiteSpace: 'nowrap',
      }}>
        {naam}
        {samenvatting && (
          <span style={{
            fontWeight: 500, color: 'var(--text-4)', textTransform: 'none',
            letterSpacing: 0, fontSize: 11, marginLeft: 8,
          }}>
            {samenvatting}
          </span>
        )}
      </div>
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
      {/* 10.5px, niet 11.5: op de grotere maat liep deze regel over de knop
          van de eerste kolomgroep heen. */}
      <div style={{
        display: 'flex', alignItems: 'center', marginTop: 8, height: 24,
        fontSize: 10.5, color: 'var(--text-4)', whiteSpace: 'nowrap',
      }}>
        bestellen → maken → leveren → innen
      </div>
    </th>
  )
}
