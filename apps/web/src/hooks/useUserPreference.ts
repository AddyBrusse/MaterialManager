import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { preferencesApi } from '../api/preferences'
import { useUserStore } from '../stores/user'

const SAVE_DEBOUNCE_MS = 500

export interface UserPreferenceHandle<T> {
  value: T
  /**
   * Accepts an updater so several changes in the same tick compose instead of
   * clobbering each other — the plain-value form reads a `value` that React
   * hasn't re-rendered yet, which silently loses all but the last change.
   */
  setValue: (next: T | ((prev: T) => T)) => void
  /** Drop the stored preference and fall back to the app default. */
  reset: () => void
  isLoading: boolean
}

/**
 * A single per-user preference, persisted server-side so it follows the user
 * between machines (this app has no passwords — the user is picked from a
 * dropdown, see stores/user).
 *
 * Writes are debounced and applied optimistically, because the callers are
 * interactive (dragging a column, clicking through colours) and would otherwise
 * fire a request per frame.
 */
export function useUserPreference<T>(key: string, fallback: T): UserPreferenceHandle<T> {
  const userId = useUserStore(s => s.user?.id) ?? null
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['preference', userId, key],
    queryFn: () => preferencesApi.get<T>(key).then(r => r.data),
    enabled: !!userId,
    staleTime: 60_000,
  })

  // `data` stays undefined until the GET resolves (null means "none saved").
  // Callers must not let the user edit before then: an edit would be based on
  // the fallback and would overwrite the layout that is still in flight.
  const isLoading = !!userId && data === undefined

  // Optimistic overlay: what the user just did, before/instead of a refetch.
  // Cleared when the identity of the preference changes (user switch), so the
  // next user never inherits the previous one's unsaved view.
  const [local, setLocal] = useState<T | null>(null)
  // Mirror of `local` written synchronously, so back-to-back setValue calls in
  // one tick each build on the previous one rather than on a stale render.
  const localRef = useRef<T | null>(null)
  useEffect(() => { localRef.current = null; setLocal(null) }, [userId, key])

  // Read inside event handlers only, so a render-time write is safe here.
  const dataRef = useRef<T | null | undefined>(data)
  dataRef.current = data
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback

  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<T | null>(null)
  // Whose edit is queued. Saves are debounced, so the selected user can change
  // before the timer fires — the write must still land on the user who made it.
  const pendingUserId = useRef<string | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current)
      timer.current = undefined
    }
    const next = pending.current
    if (next === null) return
    const owner = pendingUserId.current
    pending.current = null
    pendingUserId.current = null
    preferencesApi.set(key, next, owner)
      .then(() => {
        // Seed the cache for the user who owns this write, otherwise remounting
        // within staleTime serves the pre-edit value and the change looks lost.
        qc.setQueryData(['preference', owner, key], next)
      })
      .catch(() => {
        notifications.show({ color: 'red', message: 'Voorkeuren opslaan mislukt' })
      })
  }, [key, qc])

  // Don't lose a debounced save when the page unmounts mid-edit.
  useEffect(() => flush, [flush])

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    // Refuse to build on the fallback while the saved value is still loading —
    // that would persist "defaults + this one change" over the real layout.
    if (localRef.current === null && dataRef.current === undefined && !!userId) return
    const base = localRef.current ?? dataRef.current ?? fallbackRef.current
    const resolved = typeof next === 'function'
      ? (next as (prev: T) => T)(base as T)
      : next
    localRef.current = resolved
    setLocal(resolved)
    pending.current = resolved
    pendingUserId.current = userId
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS)
  }, [flush, userId])

  const reset = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current)
      timer.current = undefined
    }
    pending.current = null
    pendingUserId.current = null
    localRef.current = null
    setLocal(null)
    // Clear the cached copy too, or `value` keeps falling through to the old
    // saved layout and the reset looks like it did nothing.
    qc.setQueryData(['preference', userId, key], null)
    preferencesApi.reset(key).catch(() => {
      notifications.show({ color: 'red', message: 'Voorkeuren herstellen mislukt' })
    })
  }, [key, qc, userId])

  return {
    value: local ?? data ?? fallback,
    setValue,
    reset,
    isLoading,
  }
}
