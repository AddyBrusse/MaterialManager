import { useCallback } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { IconX } from '@tabler/icons-react'
import { useInitAppData } from '../../hooks/useInitAppData'
import { useAnnouncePopout } from '../../hooks/usePopout'
import { POPOUT_ENTRIES, resolvePopout } from './pageRegistry'
import logoBoers from '../../assets/logo-boers.png'
import { VerbeterpuntKnop } from '../verbeterpunt/VerbeterpuntKnop'
import { VerbeterpuntHost } from '../verbeterpunt/VerbeterpuntHost'

// Minimal chrome for a detached ("popped out") window — no main sidebar, just
// this one page plus a way to close it and get back to the main window. See
// utils/popout.ts for the open/close/track mechanism. Routes are built from
// POPOUT_ENTRIES so param routes (e.g. /projecten/:id) resolve useParams()
// exactly as they do in the main window. Pages with hideChrome own their close
// button inline (see QueueToolbar).
export function PopoutShell() {
  useInitAppData()
  const location = useLocation()
  const path = location.pathname.replace(/^\/pop/, '') || '/'
  const resolved = resolvePopout(path)
  useAnnouncePopout(path)

  const entry = resolved?.entry
  const label = resolved
    ? (entry!.labelFor ? entry!.labelFor(resolved.params) : entry!.label)
    : 'ShopCommand'

  // Stabiel per label, anders registreert de host bij elke render opnieuw.
  const bron = useCallback(() => ({ paginaNaam: label }), [label])

  return (
    <div className="st-popout-shell">
      <VerbeterpuntHost bron={bron} />
      {!entry?.hideChrome && (
        <div className="st-popout-topbar">
          <img src={logoBoers} alt="" className="st-popout-logo" />
          <span className="st-popout-title">{label}</span>
          <div className="sp" />
          <VerbeterpuntKnop />
          <button className="st-icon-btn" title="Venster sluiten" onClick={() => window.close()}>
            <IconX size={15} />
          </button>
        </div>
      )}
      <div className="st-popout-body st-content">
        <Routes>
          {POPOUT_ENTRIES.map(e => (
            <Route key={e.path} path={`/pop${e.path}`} element={<e.Component />} />
          ))}
          <Route path="*" element={<div className="st-empty">Onbekende pagina.</div>} />
        </Routes>
      </div>
    </div>
  )
}
