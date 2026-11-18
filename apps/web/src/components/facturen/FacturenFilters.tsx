import { IconPlus, IconSearch } from '@tabler/icons-react'
import { STATUS_FILTERS, type Filters } from './facturen-lijst'

interface ChipProps {
  label: string
  waarde: string
  opties: { value: string; label: string }[]
  alle: string
  onKies: (v: string) => void
}

/** Een filterchip zoals op de pagina Documenten: een select onder een label. */
function Chip({ label, waarde, opties, alle, onKies }: ChipProps) {
  return (
    <label className={`st-chip${waarde ? ' active' : ''}`}>
      {!waarde && <IconPlus size={11} />}
      <span>{label}</span>
      {waarde && <span className="chip-val">: {opties.find((o) => o.value === waarde)?.label}</span>}
      <select value={waarde} onChange={(e) => onKies(e.target.value)} aria-label={label}>
        <option value="">{alle}</option>
        {opties.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {waarde && <span className="chip-x" onClick={(e) => { e.preventDefault(); onKies('') }}>×</span>}
    </label>
  )
}

interface Props {
  filters: Filters
  onFilters: (f: Filters) => void
  klanten: { id: string; naam: string }[]
  zichtbaar: number
  totaal: number
}

export function FacturenFilters({ filters, onFilters, klanten, zichtbaar, totaal }: Props) {
  const zet = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch })
  return (
    <div className="st-toolbar">
      <div className="st-search">
        <IconSearch size={14} />
        <input placeholder="Zoek op nummer, klant, project, referentie of artikel…" value={filters.q} onChange={(e) => zet({ q: e.target.value })} />
      </div>
      <Chip label="Soort" waarde={filters.soort} alle="Facturen en credits" onKies={(v) => zet({ soort: v as Filters['soort'] })}
        opties={[{ value: 'factuur', label: 'Factuur' }, { value: 'credit', label: 'Credit' }]} />
      <Chip label="Klant" waarde={filters.klant} alle="Alle klanten" onKies={(v) => zet({ klant: v })}
        opties={klanten.map((k) => ({ value: k.id, label: k.naam }))} />
      <Chip label="Status" waarde={filters.status} alle="Elke status" onKies={(v) => zet({ status: v as Filters['status'] })} opties={STATUS_FILTERS} />
      <Chip label="Herkomst" waarde={filters.herkomst} alle="Los en project" onKies={(v) => zet({ herkomst: v as Filters['herkomst'] })}
        opties={[{ value: 'los', label: 'Los, zonder project' }, { value: 'project', label: 'Bij een project' }]} />
      <div style={{ flex: 1 }} />
      <span className="st-sub" style={{ fontSize: 12 }}>{zichtbaar} van {totaal}</span>
    </div>
  )
}
