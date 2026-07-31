import { useUserStore } from '../stores/user'

/**
 * Multipart file upload — separate from apiFetch because a FormData body
 * must NOT get a Content-Type header (the browser sets its own multipart
 * boundary), and apiFetch's 3s abort timeout is sized for JSON calls, not
 * multi-MB CAD/NC files over a LAN connection.
 */
export async function apiUpload<T>(path: string, file: File): Promise<{ data: T }> {
  const user = useUserStore.getState().user
  const headers: HeadersInit = user ? { 'x-user-id': user.id } : {}
  const form = new FormData()
  form.append('file', file)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)

  let res: Response
  try {
    res = await fetch(`/api${path}`, { method: 'POST', body: form, headers, signal: controller.signal })
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

  // A 204 (or any empty body) has nothing to parse — calling res.json() on it
  // throws "Unexpected end of JSON input", which used to turn every successful
  // DELETE into a rejected promise.
  const raw = await res.text()
  const json = raw ? JSON.parse(raw) : null

  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }

  return (json ?? { data: undefined }) as { data: T }
}
