import { useNavigate } from 'react-router-dom'
import { IconX, IconExternalLink, IconLayoutList } from '@tabler/icons-react'
import { useOpenProjects } from '../../hooks/useOpenProjects'
import { usePopoutRoutes } from '../../hooks/usePopout'
import { closeProjectTab } from '../../utils/openProjects'
import { openPopout, focusPopout } from '../../utils/popout'

// The open-projects tab strip. Rendered above the projecten pages so the user
// can switch between several open projects, close them, or pop one out into
// its own window. The active tab is derived from the current route id.
export function ProjectTabs({ activeId }: { activeId?: string }) {
  const tabs        = useOpenProjects()
  const navigate    = useNavigate()
  const poppedOut   = usePopoutRoutes()

  if (tabs.length === 0) return null

  function handleClose(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const neighbour = closeProjectTab(id)
    // Only redirect when closing the tab you're currently looking at.
    if (id === activeId) {
      navigate(neighbour ? `/projecten/${neighbour.id}` : '/projecten')
    }
  }

  function handlePopout(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    openPopout(`/projecten/${id}`)
    // If you pop out the project you're viewing, step the main window back to
    // the list so you're not looking at two copies of the same project.
    if (id === activeId) navigate('/projecten')
  }

  return (
    <div className="prj-tabs" role="tablist">
      <button
        className="prj-tabs-home"
        title="Alle projecten"
        onClick={() => navigate('/projecten')}
      >
        <IconLayoutList size={14} />
        Projecten
      </button>
      {tabs.map(t => {
        const isActive = t.id === activeId
        const isPopped = poppedOut.has(`/projecten/${t.id}`)
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={isActive}
            className={`prj-tab${isActive ? ' active' : ''}${isPopped ? ' popped' : ''}`}
            onClick={() => (isPopped ? focusPopout(`/projecten/${t.id}`) : navigate(`/projecten/${t.id}`))}
            title={isPopped ? `${t.label} — open in apart venster` : t.label}
          >
            <span className="prj-tab-lbl">{t.label}</span>
            {isPopped && <IconExternalLink size={12} className="prj-tab-popped-ic" />}
            <button
              className="prj-tab-btn"
              title="Openen in apart venster"
              onClick={e => handlePopout(e, t.id)}
            >
              <IconExternalLink size={12} />
            </button>
            <button
              className="prj-tab-btn close"
              title="Tabblad sluiten"
              onClick={e => handleClose(e, t.id)}
            >
              <IconX size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
