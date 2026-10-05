import { useState } from 'react'
import { Popover } from '@mantine/core'
import { IconBookmark, IconX } from '@tabler/icons-react'
import { useUserPreference } from '../../../hooks/useUserPreference'
import { PROJECT_VIEWS_KEY, type Filter, type Weergave } from './filters'

/**
 * Bewaarde weergaven: een rij filters onder een naam, per gebruiker en op de
 * server (`projects.views`), net als de kolomindeling. Kiezen vervangt de
 * huidige filters; × gooit de weergave weg, niet de filters op het scherm.
 */
export function WeergavenMenu({ filters, onKies }: { filters: Filter[]; onKies: (f: Filter[]) => void }) {
  const { value, setValue, isLoading } = useUserPreference<Weergave[]>(PROJECT_VIEWS_KEY, [])
  const weergaven = Array.isArray(value) ? value : []
  const [open, setOpen] = useState(false)
  const [naam, setNaam] = useState('')

  const bewaar = () => {
    const n = naam.trim()
    if (!n || filters.length === 0) return
    // Dezelfde naam overschrijft: zo pas je een weergave aan.
    setValue((oud) => [...(Array.isArray(oud) ? oud : []).filter((w) => w.naam !== n), { naam: n, filters }])
    setNaam('')
  }

  return (
    <Popover opened={open} onChange={setOpen} position="bottom-end" shadow="md" withinPortal>
      <Popover.Target>
        <button type="button" className="st-btn" disabled={isLoading} onClick={() => setOpen((o) => !o)}>
          <IconBookmark size={14} />Weergaven{weergaven.length > 0 ? ` (${weergaven.length})` : ''}
        </button>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <div className="prj-ft" style={{ minWidth: 260 }}>
          <div className="prj-ft-kop">Bewaarde weergaven</div>
          {weergaven.length === 0 && <div className="prj-ft-leeg">Nog niets bewaard.</div>}
          {weergaven.map((w) => (
            <div key={w.naam} className="prj-ft-weergave">
              <button
                type="button"
                className="prj-ft-item"
                onClick={() => { onKies(w.filters); setOpen(false) }}
                title={`${w.filters.length} ${w.filters.length === 1 ? 'filter' : 'filters'}`}
              >
                {w.naam}
              </button>
              <button
                type="button"
                className="prj-ft-weg"
                aria-label={`Weergave ${w.naam} verwijderen`}
                onClick={() => setValue((oud) => (Array.isArray(oud) ? oud : []).filter((x) => x.naam !== w.naam))}
              >
                <IconX size={12} />
              </button>
            </div>
          ))}
          <div className="prj-ft-kop">Huidige filters bewaren</div>
          {filters.length === 0 ? (
            <div className="prj-ft-leeg">Zet eerst een of meer filters aan.</div>
          ) : (
            <form className="prj-ff" onSubmit={(e) => { e.preventDefault(); bewaar() }}>
              <input className="st-input" placeholder="Naam, bijv. Maandagoverleg" value={naam} onChange={(e) => setNaam(e.target.value)} />
              <button type="submit" className="st-btn primary" disabled={!naam.trim()}>Bewaren</button>
            </form>
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}
