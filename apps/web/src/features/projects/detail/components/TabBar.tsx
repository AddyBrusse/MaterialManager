import type { TabBadge, TabId } from '../types'

const TABS: { id: TabId; label: string }[] = [
  { id: 'algemeen', label: 'Algemeen' },
  { id: 'offertes', label: 'Offertes' },
  { id: 'opdracht', label: 'Opdracht' },
  { id: 'productie', label: 'Productie' },
  { id: 'nacalculatie', label: 'Nacalculatie' },
  { id: 'documenten', label: 'Documenten' },
]

interface Props {
  actief: TabId
  badges: Record<TabId, TabBadge | null>
  onKies: (id: TabId) => void
}

/**
 * De tabbalk (§3.3). De badge is het hele punt: je ziet de stand van elke
 * sectie zonder hem te openen. Alle zes tabs blijven altijd zichtbaar, ook als
 * hun inhoud nog niet bestaat — een verdwenen tab laat iemand zoeken naar iets
 * wat er hoort te zijn.
 */
export function TabBar({ actief, badges, onKies }: Props) {
  return (
    <nav className="pdv2-tabs" role="tablist">
      {TABS.map((t) => {
        const badge = badges[t.id]
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={actief === t.id}
            className={`pdv2-tab ${actief === t.id ? 'active' : ''}`}
            onClick={() => onKies(t.id)}
          >
            {t.label}
            {badge && <span className={`pdv2-badge ${badge.kleur ?? ''}`}>{badge.tekst}</span>}
          </button>
        )
      })}
    </nav>
  )
}
