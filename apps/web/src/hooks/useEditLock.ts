import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { LockItemType } from '@stockmanager/shared'
import { locksApi } from '../api/locks'
import { useUserStore } from '../stores/user'

export interface EditLockState {
  /** This user holds the edit lock — the page is editable. */
  isHolder: boolean
  /** Someone else holds the lock — the page must be read-only. */
  isReadOnly: boolean
  /** Name of the current holder (whoever it is), or null if unlocked. */
  holderName: string | null
  /** Holder hasn't interacted for >5 min (server-computed). */
  holderIdle: boolean
}

// Server-side edit lock, cross-user and cross-machine (unlike the per-browser
// tab/popout state). The first user to open the item acquires the lock and can
// edit; anyone else who opens it sees read-only with the holder's name.
// Mirrors backend/24-locking.md: acquire on open, heartbeat every 30s, release
// on close, poll every 5s to reflect the current holder.
//
// `enabled` should be false when this instance must NOT claim the lock — e.g.
// the main window while the item is popped out into its own window (that
// window holds the lock instead).
//
// Komt het slot vrij terwijl je meekijkt (de houder sluit af, of is 5+ min
// inactief), dan pakt dit scherm het zelf (2026-10-23). Tot dan werd zo'n
// scherm bewerkbaar zónder slot: de peiling zag geen houder meer, maar niemand
// vroeg het slot aan, dus een derde kon het ook pakken.
export function useEditLock(itemType: LockItemType, id: string, enabled = true): EditLockState {
  const currentUserId = useUserStore(s => s.user?.id) ?? null
  const [acquired, setAcquired] = useState(false)
  const acquiredRef = useRef(false)

  const active = enabled && !!id && !!currentUserId

  const { data: lock, refetch } = useQuery({
    queryKey: ['lock', itemType, id],
    queryFn: () => locksApi.get(id, itemType).then(r => r.data),
    enabled: active,
    refetchInterval: 5000,
  })

  const acquire = (cancelled: () => boolean) =>
    locksApi.acquire(id, itemType)
      .then(() => {
        if (cancelled()) return
        acquiredRef.current = true
        setAcquired(true)
        refetch()
      })
      .catch(() => { if (!cancelled()) refetch() }) // held by another (409) or transient

  // Acquire on mount / id change; release on unmount.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    acquire(() => cancelled)
    return () => {
      cancelled = true
      if (acquiredRef.current) {
        locksApi.release(id, itemType).catch(() => {})
        acquiredRef.current = false
        setAcquired(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, itemType, active])

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
        method: 'POST', headers, body: JSON.stringify({ itemType }), keepalive: true,
      }).catch(() => {})
    }
    window.addEventListener('pagehide', releaseOnUnload)
    return () => window.removeEventListener('pagehide', releaseOnUnload)
  }, [active, id, itemType, currentUserId])

  const holder = lock ?? null
  // Server truth wins once the poll lands; until then trust our own acquire.
  const isHolder = holder ? holder.userId === currentUserId : acquired
  const isReadOnly = active && !!holder && holder.userId !== currentUserId

  // Vrijgekomen of verlaten slot: zelf aanvragen (zie boven).
  const vrij = lock !== undefined && (holder === null || (holder.userId !== currentUserId && holder.isIdle))
  useEffect(() => {
    if (!active || !vrij) return
    let cancelled = false
    acquire(() => cancelled)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, vrij, id, itemType])

  // Heartbeat while we hold it.
  useEffect(() => {
    if (!active || !isHolder) return
    const t = setInterval(() => {
      locksApi.heartbeat(id, itemType).catch(() => {
        acquiredRef.current = false
        setAcquired(false)
      })
    }, 30_000)
    return () => clearInterval(t)
  }, [active, isHolder, id, itemType])

  return {
    isHolder,
    isReadOnly,
    holderName: holder?.userName ?? null,
    holderIdle: holder?.isIdle ?? false,
  }
}
