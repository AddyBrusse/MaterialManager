// Outlook-style "un-tab": a route can be popped out of the main window into
// its own separate browser window, and brought back. This file is the
// generic, reusable mechanism — App.tsx renders <PopoutShell> for any
// /pop/:slug URL, AppLayout's Sidebar renders the pop-out trigger buttons,
// and this module tracks which routes are currently open elsewhere so the
// main window can show a placeholder instead of duplicating the page.
//
// Cross-window state is intentionally minimal: each window is a fully
// independent page load (own React tree, own React Query cache, own copy of
// the api/* in-memory caches seeded from localStorage) — there is no shared
// in-memory state to synchronize, only "is route X open in another window"
// which is broadcast over a BroadcastChannel (with a localStorage mirror so
// a freshly-opened window immediately knows what's already open elsewhere).

const CHANNEL_NAME = 'sm_popout_channel'
const LS_KEY = 'sm_popout_open_routes'

type PopoutMessage =
  | { type: 'opened'; path: string }
  | { type: 'closed'; path: string }
  | { type: 'requestClose'; path: string }

export const POPOUT_ROUTES = ['/planning-queue', '/planning-kanban', '/planning-gantt', '/prognose', '/todos']

function loadOpenRoutes(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}

function saveOpenRoutes(routes: Set<string>): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...routes])) } catch { /* ignore */ }
}

// Only meaningful in the window that actually called window.open — lets
// that window focus an already-open popup instead of opening a second one,
// and detect (via polling, since not every browser reliably fires an event
// the opener can observe on the popup's own unload) when it's been closed.
const windowRefs = new Map<string, Window>()
const closePollers = new Map<string, number>()

function getChannel(): BroadcastChannel | null {
  try { return new BroadcastChannel(CHANNEL_NAME) } catch { return null }
}

export function broadcastPopout(msg: PopoutMessage): void {
  const bc = getChannel()
  bc?.postMessage(msg)
  bc?.close()
}

export function subscribePopout(onMessage: (msg: PopoutMessage) => void): () => void {
  const bc = getChannel()
  if (!bc) return () => {}
  bc.onmessage = (e: MessageEvent<PopoutMessage>) => onMessage(e.data)
  return () => bc.close()
}

export function getInitialOpenRoutes(): Set<string> {
  return loadOpenRoutes()
}

export function markOpen(path: string): void {
  const routes = loadOpenRoutes()
  routes.add(path)
  saveOpenRoutes(routes)
  broadcastPopout({ type: 'opened', path })
}

export function markClosed(path: string): void {
  const routes = loadOpenRoutes()
  routes.delete(path)
  saveOpenRoutes(routes)
  broadcastPopout({ type: 'closed', path })
}

/** Open (or focus, if already open) a route in its own detached window. */
export function openPopout(path: string): void {
  const existing = windowRefs.get(path)
  if (existing && !existing.closed) { existing.focus(); return }

  const url = `${window.location.origin}/pop${path}`
  const features = 'width=1440,height=920,menubar=no,toolbar=no,location=no,status=no'
  const win = window.open(url, `sm-popout${path.replace(/\//g, '-')}`, features)
  if (!win) return

  windowRefs.set(path, win)
  markOpen(path)

  const existingPoller = closePollers.get(path)
  if (existingPoller) window.clearInterval(existingPoller)
  const poller = window.setInterval(() => {
    if (win.closed) {
      window.clearInterval(poller)
      closePollers.delete(path)
      windowRefs.delete(path)
      markClosed(path)
    }
  }, 700)
  closePollers.set(path, poller)
}

export function focusPopout(path: string): void {
  const win = windowRefs.get(path)
  if (win && !win.closed) win.focus()
  else openPopout(path)
}

/** Ask the window that owns `path` to close itself (used by the main window's placeholder). */
export function requestClosePopout(path: string): void {
  const win = windowRefs.get(path)
  if (win && !win.closed) { win.close(); return }
  broadcastPopout({ type: 'requestClose', path })
}

export function isKnownOpener(path: string): boolean {
  const win = windowRefs.get(path)
  return !!win && !win.closed
}
