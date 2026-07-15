import { useEffect, useState } from 'react'
import { getInitialOpenRoutes, subscribePopout, markOpen, markClosed } from '../utils/popout'

/** Main-window hook: which routes are currently open in a detached popout window. */
export function usePopoutRoutes(): Set<string> {
  const [routes, setRoutes] = useState<Set<string>>(getInitialOpenRoutes)

  useEffect(() => {
    const unsubscribe = subscribePopout(msg => {
      setRoutes(prev => {
        const next = new Set(prev)
        if (msg.type === 'opened') next.add(msg.path)
        else if (msg.type === 'closed') next.delete(msg.path)
        return next
      })
    })
    return unsubscribe
  }, [])

  return routes
}

/**
 * Popout-window hook: announces this window owns `path` on mount, announces
 * it's gone on unmount, and closes this window if the main window asks it
 * to (the placeholder's "sluit venster" button).
 */
export function useAnnouncePopout(path: string): void {
  useEffect(() => {
    markOpen(path)
    const unsubscribe = subscribePopout(msg => {
      if (msg.type === 'requestClose' && msg.path === path) window.close()
    })
    const handleUnload = () => markClosed(path)
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', handleUnload)
      markClosed(path)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
}
