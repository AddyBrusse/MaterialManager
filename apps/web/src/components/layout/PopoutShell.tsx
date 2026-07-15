import { useLocation } from 'react-router-dom'
import { IconX } from '@tabler/icons-react'
import { useInitAppData } from '../../hooks/useInitAppData'
import { useAnnouncePopout } from '../../hooks/usePopout'
import { POPOUT_REGISTRY } from './popoutRegistry'
import logoBoers from '../../assets/logo-boers.png'

// Minimal chrome for a detached ("popped out") window — no main sidebar, no
// other routes, just this one page plus a way to close it and get back to
// the main window. See utils/popout.ts for the open/close/track mechanism.
export function PopoutShell() {
  useInitAppData()
  const location = useLocation()
  const path = location.pathname.replace(/^\/pop/, '') || '/'
  const entry = POPOUT_REGISTRY[path]
  useAnnouncePopout(path)

  return (
    <div className="st-popout-shell">
      <div className="st-popout-topbar">
        <img src={logoBoers} alt="" className="st-popout-logo" />
        <span className="st-popout-title">{entry?.label ?? 'StaalTrack'}</span>
        <div className="sp" />
        <button className="st-icon-btn" title="Venster sluiten" onClick={() => window.close()}>
          <IconX size={15} />
        </button>
      </div>
      <div className="st-popout-body">
        {entry ? <entry.Component /> : <div className="st-empty">Onbekende pagina.</div>}
      </div>
    </div>
  )
}
