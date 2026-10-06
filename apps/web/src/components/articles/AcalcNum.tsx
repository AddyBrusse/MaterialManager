/** Compact getalveld van de calculator, met eenheid ervoor of erachter. */
export function AcalcNum({ value, onChange, unit, unitBefore, width, step = 1, min = 0 }: {
  value: number
  onChange: (v: number) => void
  unit?: string
  unitBefore?: boolean
  width?: 'w56' | 'w72'
  step?: number
  min?: number
}) {
  const input = (
    <input className={`acalc-num${width ? ' ' + width : ''}`} type="number" value={value} step={step} min={min}
      onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      onChange={e => onChange(e.target.value === '' ? 0 : +e.target.value)} />
  )
  return (
    <div className={unitBefore ? 'acalc-prijsgrp' : 'acalc-numgrp'}>
      {unitBefore && unit ? <span className="acalc-unit">{unit}</span> : null}
      {input}
      {!unitBefore && unit ? <span className="acalc-unit">{unit}</span> : null}
    </div>
  )
}
