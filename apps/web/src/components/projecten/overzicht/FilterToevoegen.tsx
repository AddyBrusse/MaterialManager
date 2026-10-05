import { useState } from 'react'
import { Popover } from '@mantine/core'
import { IconChevronLeft, IconPlus } from '@tabler/icons-react'
import { SIGNAAL_LABEL, type SignaalId } from './signalen'
import type { Filter } from './filters'
import { FilterFormulier, type FilterSoort, type Keuzes } from './FilterFormulier'

const SOORTEN: { soort: FilterSoort; label: string }[] = [
  { soort: 'klant', label: 'Klant' },
  { soort: 'contact', label: 'Contactpersoon' },
  { soort: 'status', label: 'Status' },
  { soort: 'levertijd', label: 'Levertijd' },
  { soort: 'offerteLeeftijd', label: 'Offerte langer uit dan…' },
  { soort: 'bedrag', label: 'Bedrag' },
  { soort: 'aangemaakt', label: 'Aangemaakt' },
  { soort: 'heeft', label: 'Heeft…' },
]

/**
 * "+ Filter": eerst kiezen wát (een signaal is meteen klaar, de rest vraagt
 * een waarde), dan toevoegen. Signalen die al aan staan, staan er niet meer bij.
 */
export function FilterToevoegen({ keuzes, nabelDagen, actief, onVoegToe }: {
  keuzes: Keuzes
  nabelDagen: number
  actief: (id: SignaalId) => boolean
  onVoegToe: (f: Filter) => void
}) {
  const [open, setOpen] = useState(false)
  const [soort, setSoort] = useState<FilterSoort | null>(null)
  const sluit = () => { setOpen(false); setSoort(null) }
  const klaar = (f: Filter) => { onVoegToe(f); sluit() }
  const signalen = (Object.keys(SIGNAAL_LABEL) as SignaalId[]).filter((s) => !actief(s))

  return (
    <Popover opened={open} onChange={(o) => (o ? setOpen(true) : sluit())} position="bottom-start" shadow="md" withinPortal>
      <Popover.Target>
        <button type="button" className="st-chip" onClick={() => (open ? sluit() : setOpen(true))}>
          <IconPlus size={11} /><span>Filter</span>
        </button>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <div className="prj-ft">
          {soort === null ? (
            <>
              <div className="prj-ft-kop">Eigenschap</div>
              {SOORTEN.map((s) => (
                <button key={s.soort} type="button" className="prj-ft-item" onClick={() => setSoort(s.soort)}>
                  {s.label}
                </button>
              ))}
              {signalen.length > 0 && <div className="prj-ft-kop">Signaal</div>}
              {signalen.map((s) => (
                <button key={s} type="button" className="prj-ft-item" onClick={() => klaar({ soort: 'signaal', signaal: s })}>
                  {SIGNAAL_LABEL[s]}
                </button>
              ))}
            </>
          ) : (
            <>
              <button type="button" className="prj-ft-terug" onClick={() => setSoort(null)}>
                <IconChevronLeft size={12} /> {SOORTEN.find((s) => s.soort === soort)?.label}
              </button>
              <FilterFormulier soort={soort} keuzes={keuzes} nabelDagen={nabelDagen} onKlaar={klaar} />
            </>
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}
