import { useUserStore } from '../stores/user'

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T }> {
  const user = useUserStore.getState().user
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(user ? { 'x-user-id': user.id } : {}),
    ...(options.headers ?? {}),
  }

  const res = await fetch(`/api${path}`, { ...options, headers })
  const json = await res.json()

  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }

  return json as { data: T }
}
