import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import { Menu, Tooltip } from '@mantine/core'
import {
  IconLayersLinked, IconInbox, IconSettings, IconList,
  IconChevronDown, IconBell, IconBox, IconCut, IconBookmark, IconListCheck, IconUsers,
  IconClipboardList, IconChartBar, IconArrowsSort, IconCheck, IconLogout,
  IconChecklist, IconListNumbers, IconExternalLink,
} from '@tabler/icons-react'
import { useUserStore } from '../../stores/user'
import { useQuery } from '@tanstack/react-query'
import { useInitAppData } from '../../hooks/useInitAppData'
import { usePopoutRoutes } from '../../hooks/usePopout'
import { openPopout, focusPopout, requestClosePopout, POPOUT_ROUTES } from '../../utils/popout'
import { rawMaterialsApi } from '../../api/raw-materials'
import { reservationsStore } from '../../api/reservations'
import { usersApi } from '../../api/users'
import type { User } from '@stockmanager/shared'
import logoBoers from '../../assets/logo-boers.png'
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
import { todosApi } from '../../api/todos'

function getInitials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Counts derived from the saved zaag reservations:
// - reservationCount: total reserved bars
// - zaagflowCount: number of active jobs (calculatienummer groups not yet fully done)
function readReservationCounts(): { reservationCount: number; zaagflowCount: number } {
  const list = reservationsStore.list()
  const groups = new Map<string, string[]>()
  for (const r of list) {
    const k = r.calculatieNr || '—'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r.status ?? 'open')
  }
  let zaagflowCount = 0
  for (const statuses of groups.values()) {
    if (statuses.some(s => s !== 'done')) zaagflowCount++
  }
  return { reservationCount: list.length, zaagflowCount }
}

function Sidebar({ openRoutes }: { openRoutes: Set<string> }) {
  const { user, setUser, clearUser } = useUserStore()
  const location = useLocation()

  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() })
  const users: User[] = usersData?.data ?? []

  function handleSelectUser(u: User) {
    setUser({
      id: u.id, name: u.name, role: u.role as 'admin' | 'user',
      email: u.email, achternaam: u.achternaam, titel: u.titel,
    })
  }

  // Live counts
  const { data: rawData } = useQuery({ queryKey: ['raw-materials'], queryFn: rawMaterialsApi.list })
  const voorraadCount = rawData?.data?.length ?? 0

  // Reservation + zaagflow counts — read from the reservations cache (synced from API)
  const [counts, setCounts] = useState(readReservationCounts)
  // Re-read on location change …
  useEffect(() => { setCounts(readReservationCounts()) }, [location.pathname])
  // … and immediately whenever reservations change (create in calculator,
  // start/complete in zaagflow), without needing to navigate.
  useEffect(() => {
    const handler = () => setCounts(readReservationCounts())
    window.addEventListener('sm-reservations-changed', handler)
    window.addEventListener('storage', handler) // cross-tab updates
    return () => {
      window.removeEventListener('sm-reservations-changed', handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  const { reservationCount, zaagflowCount } = counts

  const { data: todosData } = useQuery({ queryKey: ['todos'], queryFn: todosApi.list, refetchInterval: 20000 })
  const openTodoCount = todosData?.data?.filter(t => !t.done).length ?? 0

  const NAV = [
    {
      label: 'Planning',
      items: [
        { to: '/planning-queue',  label: 'Wachtrij', Icon: IconListNumbers,  count: null },
        { to: '/prognose',        label: 'Prognose', Icon: IconChartBar,     count: null },
        { to: '/todos',           label: 'ToDo',      Icon: IconChecklist,   count: openTodoCount || null },
      ],
    },
    {
      label: 'Productie',
      items: [
        { to: '/projecten',       label: 'Projecten',      Icon: IconClipboardList, count: null },
        { to: '/zaagcalculator',  label: 'Zaagcalculator', Icon: IconCut,           count: null },
        { to: '/zaagplanner',     label: 'Zaagplanner',    Icon: IconArrowsSort,    count: zaagflowCount || null, disabled: true, disabledReason: 'Hiervoor gaan we een andere applicatie gebruiken' },
        { to: '/zaagflow',        label: 'ZaagFlow',       Icon: IconListCheck,     count: zaagflowCount || null },
      ],
    },
    {
      label: 'Materiaalbeheer',
      items: [
        { to: '/voorraad',       label: 'Voorraad',      Icon: IconLayersLinked, count: voorraadCount || null },
        { to: '/reserveringen',  label: 'Reserveringen', Icon: IconBookmark,     count: reservationCount || null },
        { to: '/binnenboeken',   label: 'Binnen boeken', Icon: IconInbox,        count: null },
      ],
    },
    {
      label: 'Stamgegevens',
      items: [
        { to: '/artikelen',    label: 'Artikelen',    Icon: IconList,     count: null },
        { to: '/relaties',     label: 'Relaties',     Icon: IconUsers,    count: null },
        { to: '/instellingen', label: 'Instellingen', Icon: IconSettings, count: null },
      ],
    },
  ]

  const initials = user ? getInitials(user.name) : '?'
  const role = user?.role === 'admin' ? 'Beheerder' : 'Operator'

  return (
    <aside className="st-sidebar">
      <div className="st-sb-brand">
        <img src={logoBoers} alt="Boers Metaalbewerking" className="st-sb-brand-mark" />
      </div>

      <Menu position="bottom-start" width={220} shadow="sm">
        <Menu.Target>
          <div className="st-sb-org">
            <span className="dot"></span>
            <span>{user?.name ?? 'Gebruiker'}</span>
            <span className="chev"><IconChevronDown size={12} /></span>
          </div>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Wissel gebruiker</Menu.Label>
          {users.map((u) => (
            <Menu.Item
              key={u.id}
              leftSection={u.id === user?.id ? <IconCheck size={14} /> : <span style={{ width: 14, display: 'inline-block' }} />}
              onClick={() => handleSelectUser(u)}
            >
              {u.name}
            </Menu.Item>
          ))}
          <Menu.Divider />
          <Menu.Item leftSection={<IconLogout size={14} />} onClick={clearUser}>
            Uitloggen
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <nav className="st-sb-nav">
        {NAV.map((group) => (
          <div key={group.label}>
            <div className="st-sb-group-lbl">{group.label}</div>
            {group.items.map((item) => (
              item.disabled ? (
                <Tooltip key={item.to} label={item.disabledReason} position="right" withArrow>
                  <div className="st-sb-item disabled">
                    <item.Icon size={16} />
                    <span>{item.label}</span>
                    {item.count != null && (
                      <span className="count">{item.count}</span>
                    )}
                  </div>
                </Tooltip>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `st-sb-item${isActive ? ' active' : ''}`}
                >
                  <item.Icon size={16} />
                  <span>{item.label}</span>
                  {item.count != null && (
                    <span className="count">{item.count}</span>
                  )}
                  {POPOUT_ROUTES.includes(item.to) && (
                    <button
                      type="button"
                      className={`st-sb-popout-btn${openRoutes.has(item.to) ? ' is-open' : ''}`}
                      title={openRoutes.has(item.to) ? 'Venster tonen' : 'Openen in apart venster'}
                      onClick={e => { e.preventDefault(); e.stopPropagation(); openRoutes.has(item.to) ? focusPopout(item.to) : openPopout(item.to) }}
                    >
                      <IconExternalLink size={13} />
                    </button>
                  )}
                </NavLink>
              )
            ))}
          </div>
        ))}
      </nav>

      <div className="st-sb-footer">
        <div className="st-sb-avatar">{initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="st-sb-user">{user?.name ?? '—'}</div>
          <div className="st-sb-user-sub">{role}</div>
        </div>
        <button className="st-icon-btn" title="Meldingen">
          <IconBell size={16} />
        </button>
      </div>
    </aside>
  )
}

const ROUTE_LABELS: Record<string, [string, string]> = {
  '/planning-queue':  ['Planning',       'Wachtrij'],
  '/prognose':        ['Planning',       'Prognose'],
  '/todos':           ['Planning',       'ToDo'],
  '/projecten':       ['Productie',      'Projecten'],
  '/zaagcalculator':  ['Productie',      'Zaagcalculator'],
  '/zaagplanner':     ['Productie',      'Zaagplanner'],
  '/zaagflow':        ['Productie',      'ZaagFlow'],
  '/voorraad':        ['Materiaalbeheer', 'Voorraad'],
  '/reserveringen':   ['Materiaalbeheer', 'Reserveringen'],
  '/binnenboeken':    ['Materiaalbeheer', 'Binnen boeken'],
  '/artikelen':       ['Stamgegevens',   'Artikelen'],
  '/relaties':        ['Stamgegevens',   'Relaties'],
  '/instellingen':    ['Stamgegevens',   'Instellingen'],
}

// Shown in the main window's content area instead of the real page, for
// whichever Planning route is currently detached into its own window — same
// idea as Outlook keeping a "this message is open in a separate window"
// placeholder instead of the compose form once you've popped it out.
function PopoutAware({ path, label, openRoutes, children }: { path: string; label: string; openRoutes: Set<string>; children: ReactNode }) {
  if (!openRoutes.has(path)) return <>{children}</>
  return (
    <div className="st-popout-placeholder">
      <div className="ic"><IconExternalLink size={22} /></div>
      <div className="t">{label} is open in een apart venster</div>
      <div className="d">Gebruik dat venster, of haal de pagina terug naar het hoofdvenster.</div>
      <div className="actions">
        <button className="btn" onClick={() => focusPopout(path)}>Venster tonen</button>
        <button className="btn primary" onClick={() => requestClosePopout(path)}>Sluit venster, toon hier</button>
      </div>
    </div>
  )
}

function Topbar() {
  const location = useLocation()
  const detail = location.pathname.startsWith('/artikelen/')
    ? (['Stamgegevens', 'Artikel'] as [string, string])
    : location.pathname.startsWith('/projecten/')
    ? (['Productie', 'Project detail'] as [string, string])
    : location.pathname.startsWith('/relaties/')
    ? (['Stamgegevens', 'Relatie detail'] as [string, string])
    : undefined
  const [section, page] = detail ?? ROUTE_LABELS[location.pathname] ?? ['', '']

  return (
    <div className="st-topbar">
      <div className="crumbs">
        {section && <span>{section}</span>}
        {section && page && <span style={{ color: 'var(--text-4)' }}>›</span>}
        {page && <strong>{page}</strong>}
      </div>
      <div className="spacer" />
      <button className="st-icon-btn" title="Help">
        <IconBox size={16} />
      </button>
    </div>
  )
}

export function AppLayout() {
  useInitAppData()
  const openRoutes = usePopoutRoutes()

  return (
    <div className="st-app">
      <Sidebar openRoutes={openRoutes} />
      <div className="st-main">
        <Topbar />
        <div className="st-content">
          <Routes>
            <Route index element={<Navigate to="/voorraad" replace />} />
            <Route path="/voorraad"        element={<VoorraadPage />} />
            <Route path="/binnenboeken"    element={<BinnenBoekenPage />} />
            <Route path="/artikelen"       element={<ArtikelenPage />} />
            <Route path="/artikelen/:id"   element={<ArtikelDetailPage />} />
            <Route path="/instellingen"    element={<InstellingenPage />} />
            <Route path="/zaagcalculator"  element={<ZaagCalculatorPage />} />
            <Route path="/reserveringen"   element={<ReserveringenPage />} />
            <Route path="/zaagplanner"     element={<ZaagPlannerPage />} />
            <Route path="/zaagflow"        element={<ZaagflowPage />} />
            <Route path="/relaties"        element={<RelatiesPage />} />
            <Route path="/relaties/:id"    element={<RelatieDetailPage />} />
            <Route path="/projecten"       element={<ProjectenPage />} />
            <Route path="/projecten/:id"   element={<ProjectDetailPage />} />
            <Route path="/planning-queue"  element={<PopoutAware path="/planning-queue" label="Wachtrij" openRoutes={openRoutes}><PlanningQueuePage /></PopoutAware>} />
            <Route path="/prognose"        element={<PopoutAware path="/prognose" label="Prognose" openRoutes={openRoutes}><PrognosePage /></PopoutAware>} />
            <Route path="/todos"           element={<PopoutAware path="/todos" label="ToDo" openRoutes={openRoutes}><TodosPage /></PopoutAware>} />
            <Route path="*"               element={<Navigate to="/voorraad" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
