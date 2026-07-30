// The single app-wide tab store — "one bar to rule them all". Every opened page
// (sidebar pages and entity detail pages alike) is a tab here, keyed by its
// route path so opening the same page twice just focuses the existing tab.
// Persisted to localStorage so open tabs survive a reload.
import { createOpenTabsStore } from './openTabs'

export const pageTabs = createOpenTabsStore('sm_open_tabs')
