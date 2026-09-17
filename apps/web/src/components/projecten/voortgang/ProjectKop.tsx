// De kopregel van een project: nummer, naam, en twee knoppen. Eén regel.
//
// Waarden overgenomen uit het ontwerp (It4): 26 px mapje, projectnummer in
// mono 18/700 met −.02em letterafstand, de naam ernaast in 14.5/500 gedempt,
// en rechts Documenten plus een menu. Hoogte: 10 px padding boven en onder.
//
// Wat hier NIET meer staat, en waarom:
//  - de stappenbalk met zeven bolletjes. De kolomgroepen ín de tabel zijn nu
//    de stappen, mét hun eigen knop; twee stappenrijen boven elkaar is één te
//    veel, en die balk kostte 80 px hoogte die de artikelenlijst nodig heeft.
//  - de statusbadge, behalve als het project stilligt. Bij een lopend project
//    zegt de tabel het beter ("60 stuks liggen klaar"); bij on hold of
//    geannuleerd moet het juist meteen opvallen.
//  - de losse knoppen voor on hold, annuleren en terugkeren. Die horen niet
//    naast de naam van het project maar in het menu ernaast: het zijn
//    uitzonderingen, geen dagelijks werk.
import { useRef } from 'react'
import { Menu } from '@mantine/core'
import { IconLock } from '@tabler/icons-react'
import type { Project } from '@stockmanager/shared'

interface Props {
  project: Project
  naam: string
  onNaam: (naam: string) => void
  documentenAantal: number
  documentenOpen: boolean
  onDocumenten: () => void
  alleenLezen: boolean
  /** De menu-items: label, wat het doet, en of het uitstaat met uitleg. */
  menu: { label: string; fn: () => void; uit?: string; kleur?: string }[]
  /** Rechts van de naam, alleen als het project stilligt. */
  statusLabel?: string | null
  statusReden?: string | null
  opslaanIndicator?: React.ReactNode
}

export function ProjectKop({
  project, naam, onNaam, documentenAantal, documentenOpen, onDocumenten,
  alleenLezen, menu, statusLabel, statusReden, opslaanIndicator,
}: Props) {
  // De naam is een invoerveld dat eruitziet als tekst: klikken en typen, geen
  // bewerkmodus. Hij groeit mee met de inhoud, anders staat er een breed leeg
  // vak naast een korte naam.
  const meet = useRef<HTMLSpanElement>(null)

  return (
    <div style={{
      background: 'var(--bg-2)', borderBottom: '1px solid var(--border)',
      padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 11,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 5, background: 'rgba(15,17,22,.05)',
        color: 'var(--text-2)', display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
      </div>

      <span className="cell-mono" style={{
        fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', flexShrink: 0,
      }}>
        {project.id}
      </span>

      {/* Onzichtbare tweelingtekst die de breedte van het invoerveld bepaalt. */}
      <span ref={meet} aria-hidden style={{
        position: 'absolute', visibility: 'hidden', whiteSpace: 'pre',
        fontSize: 14.5, fontWeight: 500,
      }}>
        {naam || 'Naamloos project'}
      </span>
      <input
        value={naam}
        onChange={e => onNaam(e.target.value)}
        disabled={alleenLezen}
        placeholder="Naamloos project"
        title="Projectnaam — klik om te wijzigen"
        style={{
          fontSize: 14.5, fontWeight: 500, color: 'var(--text-2)',
          border: '1px solid transparent', background: 'transparent',
          borderRadius: 6, padding: '3px 6px', minWidth: 120,
          width: `min(${Math.max(120, (naam.length || 17) * 8 + 24)}px, 40vw)`,
          font: 'inherit', outline: 'none',
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'var(--border-input)'
          e.currentTarget.style.background = 'var(--bg-input)'
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'transparent'
          e.currentTarget.style.background = 'transparent'
        }}
      />

      {statusLabel && (
        <span
          className="badge warn"
          title={statusReden ?? undefined}
          style={{ flexShrink: 0 }}
        >
          <span className="dot" />{statusLabel}
          {statusReden && <span style={{ fontWeight: 400 }}> — {statusReden}</span>}
        </span>
      )}

      {alleenLezen && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11.5, color: 'var(--warning)', flexShrink: 0,
        }}>
          <IconLock size={13} />alleen lezen
        </span>
      )}

      <div style={{ flex: 1 }} />

      {opslaanIndicator}

      <button
        className="st-btn sm"
        data-active={documentenOpen || undefined}
        onClick={onDocumenten}
        title="Offertes, opdrachtbevestiging, pakbonnen en facturen"
      >
        Documenten
        <span className="tab-count">{documentenAantal}</span>
      </button>

      <Menu shadow="md" width={240} position="bottom-end">
        <Menu.Target>
          <button className="st-btn sm" style={{ width: 28, padding: 0, justifyContent: 'center' }} title="Meer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1.4" fill="currentColor" />
              <circle cx="12" cy="12" r="1.4" fill="currentColor" />
              <circle cx="12" cy="19" r="1.4" fill="currentColor" />
            </svg>
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          {menu.map(m => (
            <Menu.Item
              key={m.label}
              disabled={!!m.uit}
              title={m.uit}
              onClick={m.fn}
              style={m.kleur ? { color: m.kleur } : undefined}
            >
              {m.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}
