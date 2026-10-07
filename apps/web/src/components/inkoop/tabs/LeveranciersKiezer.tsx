import { useState } from 'react'
import { Popover } from '@mantine/core'
import type { InkoopLeverancier } from '@stockmanager/shared'

/**
 * Leveranciers kiezen, meerdere tegelijk (2026-10-07). De knop opent een lijst
 * met vinkjes; "Bij N regels zetten" geeft de keuze door. Wie al bij alle
 * gekozen regels staat, staat aangevinkt.
 */
export function LeveranciersKiezer({ label, leveranciers, al, aantal, onKies, knopKlasse = 'st-btn sm' }: {
  label: string
  leveranciers: InkoopLeverancier[]
  /** Leveranciers die al bij alle gekozen regels staan. */
  al: string[]
  /** Hoeveel regels het geldt (voor de knoptekst). */
  aantal: number
  onKies: (leverancierIds: string[]) => void
  knopKlasse?: string
}) {
  const [open, setOpen] = useState(false)
  const [gekozen, setGekozen] = useState<Set<string>>(new Set(al))
  const zet = (id: string, aan: boolean) => setGekozen((g) => { const n = new Set(g); aan ? n.add(id) : n.delete(id); return n })

  return (
    <Popover opened={open} onChange={setOpen} position="bottom-end" shadow="md" withinPortal trapFocus>
      <Popover.Target>
        <button type="button" className={knopKlasse} aria-haspopup="listbox" aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); setGekozen(new Set(al)); setOpen((o) => !o) }}>
          {label} ▾
        </button>
      </Popover.Target>
      <Popover.Dropdown p={6} onClick={(e) => e.stopPropagation()}>
        <div className="ib-kiezer" role="listbox" aria-multiselectable="true" aria-label="Leveranciers">
          {leveranciers.length === 0 && <div className="ib-uitleg" style={{ padding: 8 }}>Nog geen leveranciers. Maak er een aan bij Relaties (type leverancier).</div>}
          {leveranciers.map((l) => (
            <label key={l.id} data-aan={gekozen.has(l.id)}>
              <input type="checkbox" checked={gekozen.has(l.id)} onChange={(e) => zet(l.id, e.currentTarget.checked)} />
              <span>{l.naam}</span>
              {!l.email && <span className="bs-waarschuw" style={{ marginLeft: 'auto', fontSize: 11 }}>geen e-mail</span>}
            </label>
          ))}
          <div className="voet">
            <button type="button" className="st-btn sm" onClick={() => setOpen(false)}>Annuleren</button>
            <button type="button" className="st-btn primary sm" onClick={() => { setOpen(false); onKies([...gekozen]) }}>
              Bij {aantal} regel{aantal === 1 ? '' : 's'} zetten
            </button>
          </div>
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}
