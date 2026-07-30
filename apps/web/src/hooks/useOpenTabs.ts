import { useSyncExternalStore } from 'react'
import type { OpenTab, OpenTabsStore } from '../utils/openTabs'

/** Reactive list of open tabs for a given store (projects, articles, …). */
export function useOpenTabs(store: OpenTabsStore): OpenTab[] {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
