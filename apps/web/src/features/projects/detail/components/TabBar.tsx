import {
  IconAlertCircleFilled,
  IconCircleCheckFilled,
  IconCircleDotted,
  IconClockHour4,
  IconProgress,
} from '@tabler/icons-react'
import type { TabBadge, TabId } from '../types'
import type { TabStand } from '../lib/tab-stand'

const TABS: { id: TabId; label: string }[] = [
  { id: 'algemeen', label: 'Algemeen' },
  { id: 'offertes', label: 'Offertes' },
  { id: 'opdracht', label: 'Opdracht' },
  { id: 'productie', label: 'Productie' },
  { id: 'nacalculatie', label: 'Nacalculatie' },
  { id: 'documenten', label: 'Documenten' },
]

const ICOON: Record<TabStand, { Icon: typeof IconProgress; kleur: string; titel: string }> = {
  leeg: { Icon: IconCircleDotted, kleur: 'var(--text3)', titel: 'Bestaat nog niet' },
  bezig: { Icon: IconProgress, kleur: 'var(--accent-tx)', titel: 'Loopt' },
  gereed: { Icon: IconCircleCheckFilled, kleur: 'var(--ok)', titel: 'Gereed' },
  aandacht: { Icon: IconAlertCircleFilled, kleur: 'var(--warn)', titel: 'Vraagt aandacht' },
  wacht: { Icon: IconClockHour4, kleur: 'var(--warn)', titel: 'Wacht op iets buiten dit scherm' },
}

interface Props {
  actief: TabId
  badges: Record<TabId, TabBadge | null>
  standen: Record<TabId, TabStand>
  onKies: (id: TabId) => void
}

/**
 * De tabbalk (§3.3). Elke tab draagt een statusicoon plus zijn kerngetal.
 *
 * Het icoon zegt *hoe het ervoor staat*, het getal *hoeveel* — samen zie je de
 * stand van elke sectie zonder hem te openen, en dat is het hele punt van deze
 * balk. Alle zes tabs blijven altijd zichtbaar, ook als hun inhoud nog niet
 * bestaat: een verdwenen tab laat iemand zoeken naar iets wat er hoort te zijn.
 */
export function TabBar({ actief, badges, standen, onKies }: Props) {
  return (
    <nav className="pdv2-tabs" role="tablist">
      {TABS.map((t) => {
        const badge = badges[t.id]
        const { Icon, kleur, titel } = ICOON[standen[t.id]]
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={actief === t.id}
            className={`pdv2-tab ${actief === t.id ? 'active' : ''}`}
            onClick={() => onKies(t.id)}
          >
            <Icon size={13} style={{ color: kleur, flex: 'none' }} aria-label={titel} />
            {t.label}
            {badge && <span className={`pdv2-badge ${badge.kleur ?? ''}`}>{badge.tekst}</span>}
          </button>
        )
      })}
    </nav>
  )
}
