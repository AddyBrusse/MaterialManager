import { IconX } from '@tabler/icons-react'
import type { SignaalId } from './signalen'
import { filterLabel, voegToe, type Filter } from './filters'
import { FilterToevoegen } from './FilterToevoegen'
import { WeergavenMenu } from './WeergavenMenu'
import type { Keuzes } from './FilterFormulier'

/**
 * De filters als rij chips, in de volgorde waarin ze aangezet zijn — een
 * broodkruimel van hoe je bij deze lijst kwam. Elke chip heeft een ×.
 */
export function FilterBalk({ filters, onFilters, keuzes, nabelDagen, klantNaam, contactNaam }: {
  filters: Filter[]
  onFilters: (f: Filter[]) => void
  keuzes: Keuzes
  nabelDagen: number
  klantNaam: (id: string) => string
  contactNaam: (id: string) => string
}) {
  const actief = (id: SignaalId) => filters.some((f) => f.soort === 'signaal' && f.signaal === id)
  return (
    <div className="prj-filterbalk">
      {filters.length > 0 && <span className="prj-filterbalk-lbl">Filters:</span>}
      {filters.map((f, i) => (
        <span key={i} className="st-chip active prj-filterchip">
          <span>{filterLabel(f, { klantNaam, contactNaam })}</span>
          <button
            type="button"
            className="prj-chip-x"
            aria-label={`Filter ${filterLabel(f, { klantNaam, contactNaam })} weghalen`}
            onClick={() => onFilters(filters.filter((_, j) => j !== i))}
          >
            <IconX size={11} />
          </button>
        </span>
      ))}
      <FilterToevoegen
        keuzes={keuzes}
        nabelDagen={nabelDagen}
        actief={actief}
        onVoegToe={(f) => onFilters(voegToe(filters, f))}
      />
      {filters.length > 0 && (
        <button type="button" className="prj-filterbalk-wis" onClick={() => onFilters([])}>
          Alles wissen
        </button>
      )}
      <span style={{ flex: 1 }} />
      <WeergavenMenu filters={filters} onKies={onFilters} />
    </div>
  )
}
