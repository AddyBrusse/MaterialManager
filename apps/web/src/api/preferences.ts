import { apiFetch } from './client'

// Per-user UI preferences (see apps/api/src/routes/preferences.ts). The server
// scopes every call to the caller's own user id, so no user id is passed here.
// Keys are app constants today, but encode them anyway — an unescaped '/' would
// silently address a different (non-existent) route.
const enc = (key: string) => encodeURIComponent(key)

export const preferencesApi = {
  get: <T>(key: string) => apiFetch<T | null>(`/preferences/${enc(key)}`),

  /**
   * `asUserId` pins the write to a specific user. Saves are debounced, so the
   * selected user can change between the edit and the request going out —
   * without this, one user's layout would land on whoever is selected when the
   * timer fires. apiFetch spreads `headers` last, so this wins over the store.
   */
  set: <T>(key: string, value: T, asUserId?: string | null) => {
    // JSON.stringify({value: undefined}) is "{}", which the server would store
    // as null — silently wiping the saved layout. Never send that.
    if (value === undefined) return Promise.reject(new Error('preference value is undefined'))
    return apiFetch<T>(`/preferences/${enc(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
      ...(asUserId ? { headers: { 'x-user-id': asUserId } } : {}),
    })
  },

  reset: (key: string) => apiFetch<void>(`/preferences/${enc(key)}`, { method: 'DELETE' }),
}
