import type { ReactNode } from 'react'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { eur, pct } from '../../lib/format'
import { DEV_BREEDTE, devBalk, devKleurVar, kleurClass } from '../../lib/nacalculatie'

/** Kolommen van de boom: omschrijving · tijd · gecalculeerd · werkelijk · verschil · % · afwijking. */
export const KOLOMMEN = 7

export function DevBalk({ pctWaarde }: { pctWaarde: number | null }) {
  const b = devBalk(pctWaarde)
  return (
    <span className="pdv2-dev" style={{ display: 'inline-block', width: DEV_BREEDTE }}>
      {b && <i style={{ left: b.left, width: b.width, background: devKleurVar(pctWaarde) }} />}
    </span>
  )
}

/** Verschil, % en balk — of drie streepjes als er niets te vergelijken valt. */
export function VerschilCellen({ verschil, pctWaarde }: { verschil: number | null; pctWaarde: number | null }) {
  if (verschil === null) {
    return (
      <>
        <td className="num">—</td>
        <td className="num">—</td>
        <td />
      </>
    )
  }
  const kleur = kleurClass(pctWaarde)
  const stijl = kleur ? { color: `var(--${kleur})` } : undefined
  return (
    <>
      <td className="num" style={stijl}>{eur(verschil)}</td>
      <td className="num" style={stijl}>{pct(pctWaarde)}</td>
      <td>{pctWaarde !== null && <DevBalk pctWaarde={pctWaarde} />}</td>
    </>
  )
}

/**
 * De eerste cel van een rij in de boom: inspringen per niveau, en een pijltje
 * als er iets onder zit. De hele cel is de knop, niet alleen het pijltje — op
 * een rij van 11 px mik je anders mis.
 */
export function BoomCel({ diepte, open, onToggle, children }: {
  diepte: number
  /** Undefined: niets om uit te klappen. */
  open?: boolean
  onToggle?: () => void
  children: ReactNode
}) {
  const inspring = { paddingLeft: 10 + diepte * 18 }
  if (open === undefined || !onToggle) {
    return <td style={{ ...inspring, paddingLeft: inspring.paddingLeft + 18 }}>{children}</td>
  }
  return (
    <td style={inspring}>
      <button type="button" className="pdv2-boom-knop" onClick={onToggle} aria-expanded={open}>
        {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        <span>{children}</span>
      </button>
    </td>
  )
}
