import { useState } from 'react'
import { leesGetal, toonGetal } from './calc-helpers'

/**
 * Compact getalveld van de calculator, met eenheid ervoor of erachter.
 *
 * Een tekstveld en geen `type="number"` (2026-10-23): dat volgt de notatie van
 * de browser, zodat er "3.71" stond in een app die verder overal een komma
 * toont. Tijdens het typen blijft staan wat je typt; pas bij het verlaten
 * wordt het netjes opgemaakt. Pijl op/neer telt `step` erbij of eraf.
 */
export function AcalcNum({ value, onChange, unit, unitBefore, width, step = 1, min = 0, placeholder }: {
  value: number
  onChange: (v: number) => void
  unit?: string
  unitBefore?: boolean
  width?: 'w56' | 'w72'
  step?: number
  min?: number
  placeholder?: string
}) {
  const [tekst, setTekst] = useState<string | null>(null) // null = niet aan het typen
  const zet = (v: number) => onChange(Math.max(min, v))
  const input = (
    <input className={`acalc-num${width ? ' ' + width : ''}`} type="text" inputMode="decimal"
      value={tekst ?? toonGetal(value)} placeholder={placeholder}
      onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      onFocus={e => { setTekst(toonGetal(value)); e.currentTarget.select() }}
      onBlur={() => setTekst(null)}
      onChange={e => {
        setTekst(e.target.value)
        const v = leesGetal(e.target.value)
        if (e.target.value.trim() === '') zet(0)
        else if (v != null) zet(v)
      }}
      onKeyDown={e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        const v = Math.max(min, Math.round((value + (e.key === 'ArrowUp' ? step : -step)) * 1000) / 1000)
        setTekst(toonGetal(v))
        onChange(v)
      }} />
  )
  return (
    <div className={unitBefore ? 'acalc-prijsgrp' : 'acalc-numgrp'}>
      {unitBefore && unit ? <span className="acalc-unit">{unit}</span> : null}
      {input}
      {!unitBefore && unit ? <span className="acalc-unit">{unit}</span> : null}
    </div>
  )
}
