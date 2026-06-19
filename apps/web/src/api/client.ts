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

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)

  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...options, headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  const json = await res.json()

  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }

  return json as { data: T }
}
