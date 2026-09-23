import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { locksApi } from '../api/locks'
import { useUserStore } from '../stores/user'

export interface ProjectLockState {
  /** This user holds the edit lock — the page is editable. */
  isHolder: boolean
  /** Someone else holds the lock — the page must be read-only. */
  isReadOnly: boolean
  /** Name of the current holder (whoever it is), or null if unlocked. */
  holderName: string | null
  /** Holder hasn't interacted for >5 min (server-computed). */
  holderIdle: boolean
}

// Server-side edit lock for a project, cross-user and cross-machine (unlike the
// per-browser tab/popout state). The first user to open a project acquires the
// lock and can edit; anyone else who opens it sees read-only with the holder's
// name. Mirrors backend/24-locking.md: acquire on open, heartbeat every 30s,
// release on close, poll every 5s to reflect the current holder.
//
// `enabled` should be false when this instance must NOT claim the lock — e.g.
// the main window while the project is popped out into its own window (that
// window holds the lock instead).
export function useProjectLock(id: string, enabled = true): ProjectLockState {
  const currentUserId = useUserStore(s => s.user?.id) ?? null
  const [acquired, setAcquired] = useState(false)
  const acquiredRef = useRef(false)

  const active = enabled && !!id && !!currentUserId

  const { data: lock, refetch } = useQuery({
    queryKey: ['lock', 'project', id],
    queryFn: () => locksApi.get(id, 'project').then(r => r.data),
    enabled: active,
    refetchInterval: 5000,
  })

  // Acquire on mount / id change; release on unmount.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    locksApi.acquire(id, 'project')
      .then(() => {
        if (cancelled) return
        acquiredRef.current = true
        setAcquired(true)
        refetch()
      })
      .catch(() => { if (!cancelled) refetch() }) // held by another (409) or transient
    return () => {
      cancelled = true
      if (acquiredRef.current) {
        locksApi.release(id, 'project').catch(() => {})
        acquiredRef.current = false
        setAcquired(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, active])

  // The unmount cleanup above only runs for an SPA navigation — closing the
  // tab, refreshing, or a crash skips it entirely, and the server-side lock
  // then survives until someone notices and force-releases it (see
  // apps/api/src/routes/locks.ts). `pagehide` fires in both cases; `fetch`
  // with `keepalive` (unlike sendBeacon) can still carry the `x-user-id`
  // header the server needs to identify the holder.
  useEffect(() => {
    if (!active) return
    const releaseOnUnload = () => {
      if (!acquiredRef.current) return
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (currentUserId) headers['x-user-id'] = currentUserId
      fetch(`/api/locks/${id}/release`, {
        method: 'POST', headers, body: JSON.stringify({ itemType: 'project' }), keepalive: true,
      }).catch(() => {})
    }
    window.addEventListener('pagehide', releaseOnUnload)
    return () => window.removeEventListener('pagehide', releaseOnUnload)
  }, [active, id, currentUserId])

  const holder = lock ?? null
  // Server truth wins once the poll lands; until then trust our own acquire.
  const isHolder = holder ? holder.userId === currentUserId : acquired
  const isReadOnly = active && !!holder && holder.userId !== currentUserId

  // Heartbeat while we hold it.
  useEffect(() => {
    if (!active || !isHolder) return
    const t = setInterval(() => {
      locksApi.heartbeat(id, 'project').catch(() => {
        acquiredRef.current = false
        setAcquired(false)
      })
    }, 30_000)
    return () => clearInterval(t)
  }, [active, isHolder, id])

  return {
    isHolder,
    isReadOnly,
    holderName: holder?.userName ?? null,
    holderIdle: holder?.isIdle ?? false,
  }
}
