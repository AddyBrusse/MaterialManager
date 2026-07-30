import type { ComponentType } from 'react'
import { matchPath } from 'react-router-dom'
import {
  IconLayersLinked, IconInbox, IconSettings, IconList, IconCut, IconBookmark,
  IconUsers, IconClipboardList, IconChartBar, IconArrowsSort, IconListCheck,
  IconChecklist, IconListNumbers, type Icon as TablerIcon,
} from '@tabler/icons-react'
import { VoorraadPage } from '../../routes/desktop/VoorraadPage'
import { ArtikelenPage } from '../../routes/desktop/ArtikelenPage'
import { ArtikelDetailPage } from '../../routes/desktop/ArtikelDetailPage'
import { BinnenBoekenPage } from '../../routes/desktop/BinnenBoekenPage'
import { InstellingenPage } from '../../routes/desktop/InstellingenPage'
import { ZaagCalculatorPage } from '../../routes/desktop/ZaagCalculatorPage'
import { ReserveringenPage } from '../../routes/desktop/ReserveringenPage'
import { ZaagPlannerPage } from '../../routes/desktop/ZaagPlannerPage'
import { ZaagflowPage } from '../../routes/desktop/ZaagflowPage'
import { RelatiesPage } from '../../routes/desktop/RelatiesPage'
import { RelatieDetailPage } from '../../routes/desktop/RelatieDetailPage'
import { ProjectenPage } from '../../routes/desktop/ProjectenPage'
import { ProjectDetailPage } from '../../routes/desktop/ProjectDetailPage'
import { PlanningQueuePage } from '../../routes/desktop/PlanningQueuePage'
import { PrognosePage } from '../../routes/desktop/PrognosePage'
import { TodosPage } from '../../routes/desktop/TodosPage'

// Single source of truth for every tabbable / poppable page in the app. Feeds:
// - the global tab bar (label + icon per open route)
// - the popout windows (Component per poppable route)
// `path` is a React Router pattern (may contain params, e.g. /artikelen/:id).
// `labelFor` derives a per-instance label for detail pages from route params;
// the detail page itself later refines it to the real entity name via
// pageTabs.open (see ProjectDetailPage / ArtikelDetailPage).
export interface PageEntry {
  path: string
  label: string
  Icon: TablerIcon
  Component: ComponentType
  poppable?: boolean
  hideChrome?: boolean
  labelFor?: (params: Record<string, string | undefined>) => string
}

export const PAGES: PageEntry[] = [
  // Planning
  { path: '/planning-queue', label: 'Wachtrij', Icon: IconListNumbers, Component: PlanningQueuePage, poppable: true, hideChrome: true },
  { path: '/prognose',       label: 'Prognose', Icon: IconChartBar,    Component: PrognosePage,      poppable: true },
  { path: '/todos',          label: 'ToDo',     Icon: IconChecklist,   Component: TodosPage,         poppable: true },
  // Productie
  { path: '/projecten',      label: 'Projecten',     Icon: IconClipboardList, Component: ProjectenPage,     poppable: true },
  { path: '/projecten/:id',  label: 'Project',       Icon: IconClipboardList, Component: ProjectDetailPage, poppable: true, labelFor: p => `Project ${p.id ?? ''}`.trim() },
  { path: '/zaagcalculator', label: 'Zaagcalculator', Icon: IconCut,          Component: ZaagCalculatorPage, poppable: true },
  { path: '/zaagplanner',    label: 'Zaagplanner',   Icon: IconArrowsSort,    Component: ZaagPlannerPage,   poppable: true },
  { path: '/zaagflow',       label: 'ZaagFlow',      Icon: IconListCheck,     Component: ZaagflowPage,      poppable: true },
  // Materiaalbeheer
  { path: '/voorraad',       label: 'Voorraad',      Icon: IconLayersLinked, Component: VoorraadPage,      poppable: true },
  { path: '/reserveringen',  label: 'Reserveringen', Icon: IconBookmark,     Component: ReserveringenPage, poppable: true },
  { path: '/binnenboeken',   label: 'Binnen boeken', Icon: IconInbox,        Component: BinnenBoekenPage,  poppable: true },
  // Stamgegevens
  { path: '/artikelen',      label: 'Artikelen',    Icon: IconList,     Component: ArtikelenPage,     poppable: true },
  { path: '/artikelen/:id',  label: 'Artikel',      Icon: IconList,     Component: ArtikelDetailPage, poppable: true, labelFor: p => `Artikel ${p.id ?? ''}`.trim() },
  { path: '/relaties',       label: 'Relaties',     Icon: IconUsers,    Component: RelatiesPage,      poppable: true },
  { path: '/relaties/:id',   label: 'Relatie',      Icon: IconUsers,    Component: RelatieDetailPage, poppable: true, labelFor: () => 'Relatie' },
  { path: '/instellingen',   label: 'Instellingen', Icon: IconSettings, Component: InstellingenPage,  poppable: true },
]

/** Resolve a concrete pathname (e.g. /artikelen/ART-1) to its page entry + route params. */
export function resolvePage(path: string): { entry: PageEntry; params: Record<string, string | undefined> } | null {
  for (const entry of PAGES) {
    const m = matchPath(entry.path, path)
    if (m) return { entry, params: m.params }
  }
  return null
}

/** The label a freshly-opened tab should carry for a given pathname. */
export function tabLabelFor(path: string): string {
  const resolved = resolvePage(path)
  if (!resolved) return path
  return resolved.entry.labelFor ? resolved.entry.labelFor(resolved.params) : resolved.entry.label
}

// ── Popout ────────────────────────────────────────────────────────────────────
// PopoutShell renders these; only poppable pages are detachable.
export const POPOUT_ENTRIES = PAGES.filter(p => p.poppable)

export function resolvePopout(path: string): { entry: PageEntry; params: Record<string, string | undefined> } | null {
  const resolved = resolvePage(path)
  if (!resolved || !resolved.entry.poppable) return null
  return resolved
}
