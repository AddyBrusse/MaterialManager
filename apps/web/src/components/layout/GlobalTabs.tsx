import { useLocation, useNavigate } from 'react-router-dom'
import { IconX, IconExternalLink } from '@tabler/icons-react'
import { useOpenTabs } from '../../hooks/useOpenTabs'
import { usePopoutRoutes } from '../../hooks/usePopout'
import { openPopout, focusPopout } from '../../utils/popout'
import { pageTabs } from '../../utils/pageTabs'
import { resolvePage } from './pageRegistry'

// The single app-wide tab bar. Every open page lives here; the active tab is the
// current route. Switch (click), close (×), or pop out (↗) any tab. Popped-out
// tabs stay in the bar (greyed) and clicking them focuses their window instead
// of opening a duplicate.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The id worth showing on a tab. Business numbers (PRJ-2026-034, ART-0001) mean
 * something to the shop; surrogate UUIDs (relaties) are noise, so those tabs
 * show just the name.
 */
function tabNummer(id: string | undefined): string | null {
  if (!id || UUID_RE.test(id)) return null
  return id
}

export function GlobalTabs() {
  const tabs      = useOpenTabs(pageTabs)
  const { pathname } = useLocation()
  const navigate  = useNavigate()
  const poppedOut = usePopoutRoutes()

  if (tabs.length === 0) return null

  const firstOtherThan = (path: string) => tabs.find(t => t.id !== path)?.id ?? '/voorraad'

  function handleClose(e: React.MouseEvent, path: string) {
    e.stopPropagation()
    const neighbour = pageTabs.close(path)
    if (path === pathname) navigate(neighbour ? neighbour.id : '/voorraad')
  }

  function handlePopout(e: React.MouseEvent, path: string) {
    e.stopPropagation()
    openPopout(path)
    // Don't keep showing the popped page in the main window.
    if (path === pathname) navigate(firstOtherThan(path))
  }

  return (
    <div className="gt-bar" role="tablist">
      {tabs.map(t => {
        const isActive = t.id === pathname
        const isPopped = poppedOut.has(t.id)
        const resolved = resolvePage(t.id)
        const Icon = resolved?.entry.Icon
        // Detail routes carry their entity id in the path (/projecten/PRJ-2026-034)
        // — show it stacked above the name so the full number is visible without
        // making the tab any wider than its (truncated) name already needs.
        const nummer = tabNummer(resolved?.params.id)
        const fullTitle = [nummer, t.label].filter(Boolean).join(' · ')
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={isActive}
            className={`gt-tab${isActive ? ' active' : ''}${isPopped ? ' popped' : ''}`}
            onClick={() => (isPopped ? focusPopout(t.id) : navigate(t.id))}
            title={isPopped ? `${fullTitle} — open in apart venster` : fullTitle}
          >
            {Icon && <Icon size={14} className="gt-tab-ic" />}
            <span className="gt-tab-txt">
              {nummer && <span className="gt-tab-num">{nummer}</span>}
              <span className="gt-tab-lbl">{t.label}</span>
            </span>
            {isPopped && <IconExternalLink size={11} className="gt-tab-popped-ic" />}
            <button className="gt-tab-btn" title="Openen in apart venster" onClick={e => handlePopout(e, t.id)}>
              <IconExternalLink size={12} />
            </button>
            <button className="gt-tab-btn close" title="Tabblad sluiten" onClick={e => handleClose(e, t.id)}>
              <IconX size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
