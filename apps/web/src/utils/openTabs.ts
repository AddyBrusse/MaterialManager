// Generic "open tabs" store — the shared engine behind the projecten and
// artikelen multi-open tab strips. An ordered list of {id,label} persisted to
// localStorage so a reload keeps the tabs. Main-window, single-browser state;
// NOT the cross-user lock (api/locks.ts) nor the cross-window popout tracker
// (utils/popout.ts). Instantiate one per entity type (see openProjects.ts /
// openArticles.ts).

export interface OpenTab {
  id: string
  label: string
}

export interface OpenTabsStore {
  subscribe(cb: () => void): () => void
  /** Stable snapshot for useSyncExternalStore — reference only changes on mutate. */
  getSnapshot(): OpenTab[]
  /** Add a tab (or refresh its label if already open). */
  open(id: string, label: string): void
  /** Add a tab only if missing — never overwrites an existing (persisted) label. */
  ensure(id: string, label: string): void
  /**
   * Remove a tab. Returns the neighbour tab the caller should navigate to when
   * the closed tab was the active one (right neighbour, else left, else
   * undefined → caller falls back to the list).
   */
  close(id: string): OpenTab | undefined
  /** Update a tab's label once the entity's real name is known. */
  rename(id: string, label: string): void
}

export function createOpenTabsStore(lsKey: string): OpenTabsStore {
  let tabs: OpenTab[] = load()
  const listeners = new Set<() => void>()

  function load(): OpenTab[] {
    try {
      const raw = localStorage.getItem(lsKey)
      if (raw) return JSON.parse(raw) as OpenTab[]
    } catch { /* ignore */ }
    return []
  }

  function commit(next: OpenTab[]): void {
    tabs = next
    try { localStorage.setItem(lsKey, JSON.stringify(tabs)) } catch { /* ignore */ }
    listeners.forEach(l => l())
  }

  return {
    subscribe(cb) {
      listeners.add(cb)
      return () => { listeners.delete(cb) }
    },
    getSnapshot() {
      return tabs
    },
    open(id, label) {
      const existing = tabs.find(t => t.id === id)
      if (existing) {
        if (existing.label !== label) {
          commit(tabs.map(t => (t.id === id ? { ...t, label } : t)))
        }
        return
      }
      commit([...tabs, { id, label }])
    },
    ensure(id, label) {
      if (tabs.some(t => t.id === id)) return
      commit([...tabs, { id, label }])
    },
    close(id) {
      const idx = tabs.findIndex(t => t.id === id)
      if (idx === -1) return undefined
      const neighbour = tabs[idx + 1] ?? tabs[idx - 1]
      commit(tabs.filter(t => t.id !== id))
      return neighbour
    },
    rename(id, label) {
      const existing = tabs.find(t => t.id === id)
      if (existing && existing.label !== label) {
        commit(tabs.map(t => (t.id === id ? { ...t, label } : t)))
      }
    },
  }
}
