import { useMemo, useState } from 'react'
import type { Relatie } from '@stockmanager/shared'
import { IconSearch, IconX } from '@tabler/icons-react'
import { type PlanningStapItem, klantNaam } from '../../utils/planningGanttUtils'

interface GanttSearchBoxProps {
  allItems: PlanningStapItem[]
  relaties: Relatie[]
  onSelect: (item: PlanningStapItem) => void
}

const MAX_RESULTS = 8

function fmtShortNL(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

// Finds a step by article name, project id or klant — selecting a result
// reuses the existing connector-line/highlight machinery (selectedProjectId)
// to surface "all its connecting steps", so no separate highlighting logic
// is needed here.
export function GanttSearchBox({ allItems, relaties, onSelect }: GanttSearchBoxProps) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    return allItems
      .filter(item =>
        item.order.artikelNaam.toLowerCase().includes(query) ||
        item.project.id.toLowerCase().includes(query) ||
        klantNaam(relaties, item.project).toLowerCase().includes(query),
      )
      .slice(0, MAX_RESULTS)
  }, [q, allItems, relaties])

  function pick(item: PlanningStapItem) {
    onSelect(item)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="gantt-search">
      <IconSearch size={13} className="gs-ico" />
      <input
        placeholder="Zoek artikel, order of klant…"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => { if (e.key === 'Escape') { setQ(''); setOpen(false) } }}
      />
      {q && (
        <button className="gs-clear" onClick={() => setQ('')} title="Wissen">
          <IconX size={12} />
        </button>
      )}
      {open && q && (
        <div className="gs-results">
          {results.length === 0 && <div className="gs-empty">Niets gevonden voor "{q}"</div>}
          {results.map(item => (
            <button key={item.stap.id} className="gs-result" onMouseDown={() => pick(item)}>
              <span className="gs-r-top">
                <span className="gs-r-proj">{item.project.id}</span>
                <span className="gs-r-klant">{klantNaam(relaties, item.project)}</span>
              </span>
              <span className="gs-r-name">{item.order.artikelNaam}</span>
              <span className="gs-r-status">
                {item.stap.geplandDatum ? `gepland op ${fmtShortNL(item.stap.geplandDatum)}` : 'in backlog'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
