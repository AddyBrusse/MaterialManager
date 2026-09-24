import type { TabBadge, TabId } from '../types'
import type { TabStand } from '../lib/tab-stand'

const TABS: { id: TabId; label: string }[] = [
  { id: 'algemeen', label: 'Algemeen' },
  { id: 'offertes', label: 'Offertes' },
  { id: 'opdracht', label: 'Opdracht' },
  { id: 'productie', label: 'Productie' },
  { id: 'nacalculatie', label: 'Nacalculatie' },
  { id: 'documenten', label: 'Documenten' },
  { id: 'financieel', label: 'Financieel' },
  { id: 'reserveringen', label: 'Reserveringen' },
  { id: 'aandacht', label: 'Aandacht' },
]

/** Wat de kleur van de indicatie betekent — ook als titel op het element. */
const STAND: Record<TabStand, { klasse: string; titel: string }> = {
  leeg: { klasse: '', titel: 'Bestaat nog niet' },
  bezig: { klasse: 'accent', titel: 'Loopt' },
  gereed: { klasse: 'ok', titel: 'Gereed' },
  aandacht: { klasse: 'warn', titel: 'Vraagt aandacht' },
  wacht: { klasse: 'wacht', titel: 'Wacht op iets buiten dit scherm' },
}

interface Props {
  actief: TabId
  badges: Record<TabId, TabBadge | null>
  standen: Record<TabId, TabStand>
  onKies: (id: TabId) => void
}

/**
 * De tabbalk (§3.3), in de vorm van de hoofdnavigatie: dezelfde tabvorm als
 * `.gt-tab` in `styles/tokens.css`, zodat de balk binnen een pagina niet als
 * een tweede, vreemd systeem leest.
 *
 * **Geen icoon voor de naam.** De stand van een sectie staat in de kleur van de
 * indicatie rechts van de naam: grijs bestaat nog niet, blauw loopt, groen
 * gereed, amber vraagt aandacht. Eén element rechts in plaats van twee links en
 * rechts — en de kleur komt uit één bron (`bouwTabStanden`), zodat de indicatie
 * nooit iets anders zegt dan de tab zelf.
 *
 * Alle tabs blijven altijd zichtbaar, ook als hun inhoud nog niet bestaat: een
 * verdwenen tab laat iemand zoeken naar iets wat er hoort te zijn.
 */
export function TabBar({ actief, badges, standen, onKies }: Props) {
  return (
    <nav className="pdv2-tabs" role="tablist">
      {TABS.map((t) => {
        const badge = badges[t.id]
        const stand = STAND[standen[t.id]]
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={actief === t.id}
            className={`pdv2-tab ${actief === t.id ? 'active' : ''}`}
            onClick={() => onKies(t.id)}
          >
            <span className="pdv2-tab-lbl">{t.label}</span>
            {badge && (
              <span className={`pdv2-badge ${stand.klasse}`} title={stand.titel}>
                {badge.tekst}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
