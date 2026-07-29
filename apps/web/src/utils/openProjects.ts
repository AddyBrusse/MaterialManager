// The set of project tabs the user currently has open — the "work on several
// projects at once" mechanism. An ordered list, persisted to localStorage so a
// reload keeps the tabs. This is main-window, single-browser state; it is NOT
// the cross-user lock (see api/locks.ts) nor the cross-window popout tracker
// (see utils/popout.ts) — those solve different problems.

export interface OpenProjectTab {
  id: string
  label: string
}

const LS_KEY = 'sm_open_projects'

let tabs: OpenProjectTab[] = load()
const listeners = new Set<() => void>()

function load(): OpenProjectTab[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as OpenProjectTab[]
  } catch { /* ignore */ }
  return []
}

function commit(next: OpenProjectTab[]): void {
  tabs = next
  try { localStorage.setItem(LS_KEY, JSON.stringify(tabs)) } catch { /* ignore */ }
  listeners.forEach(l => l())
}

export function subscribeOpenProjects(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Stable snapshot for useSyncExternalStore — reference only changes on mutate. */
export function getOpenProjectsSnapshot(): OpenProjectTab[] {
  return tabs
}

/** Add a tab (or refresh its label if already open). */
export function openProjectTab(id: string, label: string): void {
  const existing = tabs.find(t => t.id === id)
  if (existing) {
    if (existing.label !== label) {
      commit(tabs.map(t => (t.id === id ? { ...t, label } : t)))
    }
    return
  }
  commit([...tabs, { id, label }])
}

/**
 * Remove a tab. Returns the neighbour tab the caller should navigate to when
 * the closed tab was the active one (the tab to its right, else its left,
 * else undefined → back to the project list).
 */
export function closeProjectTab(id: string): OpenProjectTab | undefined {
  const idx = tabs.findIndex(t => t.id === id)
  if (idx === -1) return undefined
  const neighbour = tabs[idx + 1] ?? tabs[idx - 1]
  commit(tabs.filter(t => t.id !== id))
  return neighbour
}

/** Update a tab's label once the project's real name is known. */
export function renameProjectTab(id: string, label: string): void {
  const existing = tabs.find(t => t.id === id)
  if (existing && existing.label !== label) {
    commit(tabs.map(t => (t.id === id ? { ...t, label } : t)))
  }
}
