export type ArtikelTab = 'calculatie' | 'bestanden' | 'nacalculatie' | 'prijshistorie' | 'historie'

const TABS: { id: ArtikelTab; label: string }[] = [
  { id: 'calculatie', label: 'Calculatie' },
  { id: 'bestanden', label: 'Bestanden' },
  { id: 'nacalculatie', label: 'Nacalculatie' },
  { id: 'prijshistorie', label: 'Prijshistorie' },
  { id: 'historie', label: 'Historie' },
]

/**
 * De tabbalk van een artikel in de vorm van de rest van de app (2026-10-23):
 * mapjes zoals de projectpagina (`.pdv2-tab`) en de hoofdnavigatie
 * (`.gt-tab`), geen onderstreping met icoon. Een aantal staat als badge
 * rechts van de naam.
 */
export function ArtikelTabs({ actief, aantallen, onKies }: {
  actief: ArtikelTab
  aantallen: Partial<Record<ArtikelTab, number>>
  onKies: (t: ArtikelTab) => void
}) {
  return (
    <nav className="ad-tabs" role="tablist">
      {TABS.map(t => {
        const n = aantallen[t.id] ?? 0
        return (
          <button key={t.id} type="button" role="tab" aria-selected={actief === t.id}
            className={`ad-tab${actief === t.id ? ' active' : ''}`} onClick={() => onKies(t.id)}>
            <span>{t.label}</span>
            {n > 0 && <span className="ad-tab-badge">{n}</span>}
          </button>
        )
      })}
    </nav>
  )
}
