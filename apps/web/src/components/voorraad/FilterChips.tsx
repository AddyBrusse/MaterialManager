import { useState } from 'react'
import { Popover } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { zetVan, bereikActief, bereikTekst, GEEN_BEREIK, type Bereik } from './voorraad-filters'

/**
 * Het kruisje zet het filter terug op "Alle". Het moet boven de onzichtbare
 * keuzelijst liggen die de hele chip bedekt (`.st-chip .chip-x` in tokens.css),
 * anders opent een klik erop gewoon de lijst.
 */
function Kruisje({ label, onWis }: { label: string; onWis: () => void }) {
  return (
    <span className="chip-x" role="button" aria-label={`${label}: filter wissen`}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWis() }}>×</span>
  )
}

export function FilterChip({ label, value, options, onChange }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  const active = value !== ''
  const opt = options.find(([v]) => v === value)
  return (
    <label className={`st-chip${active ? ' active' : ''}`}>
      {!active && <IconPlus size={11} />}
      <span>{label}</span>
      {active && <span className="chip-val">: {opt?.[1] ?? value}</span>}
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {active && <Kruisje label={label} onWis={() => onChange('')} />}
    </label>
  )
}

const getal = (s: string): number | null => {
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(n) ? null : n
}
const tekst = (n: number | null) => (n == null ? '' : String(n).replace('.', ','))

/**
 * Van–tot (maat, lengte). "Van" vult "tot" mee (`zetVan`), zodat 50 meteen
 * alleen 50 laat zien; 55 bij "tot" maakt er 50 t/m 55 van. Filtert terwijl
 * je typt.
 */
export function BereikChip({ label, eenheid, value, onChange }: {
  label: string; eenheid?: string; value: Bereik; onChange: (b: Bereik) => void
}) {
  const [open, setOpen] = useState(false)
  const actief = bereikActief(value)
  return (
    <Popover opened={open} onChange={setOpen} position="bottom-start" shadow="md" withinPortal trapFocus>
      <Popover.Target>
        <span className={`st-chip${actief ? ' active' : ''}`} role="button" tabIndex={0} aria-haspopup="dialog" aria-expanded={open}
          onClick={() => setOpen((o) => !o)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o) } }}>
          {!actief && <IconPlus size={11} />}
          <span>{label}</span>
          {actief && <span className="chip-val">: {bereikTekst(value, eenheid)}</span>}
          {actief && <Kruisje label={label} onWis={() => { onChange(GEEN_BEREIK); setOpen(false) }} />}
        </span>
      </Popover.Target>
      <Popover.Dropdown p={10}>
        <form className="vr-bereik" onSubmit={(e) => { e.preventDefault(); setOpen(false) }}>
          <label>Van<input value={tekst(value.van)} inputMode="decimal" aria-label={`${label} van`} data-autofocus
            onChange={(e) => onChange(zetVan(value, getal(e.currentTarget.value)))} /></label>
          <span>–</span>
          <label>Tot<input value={tekst(value.tot)} inputMode="decimal" aria-label={`${label} tot`}
            onChange={(e) => onChange({ ...value, tot: getal(e.currentTarget.value) })} /></label>
          {eenheid && <span className="vr-eenheid">{eenheid}</span>}
          <button type="submit" hidden />
        </form>
      </Popover.Dropdown>
    </Popover>
  )
}
