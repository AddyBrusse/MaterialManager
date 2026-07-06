import { useState, useEffect } from 'react'
import { NavLink, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import { Menu, Tooltip } from '@mantine/core'
import {
  IconLayersLinked, IconInbox, IconSettings, IconList,
  IconChevronDown, IconBell, IconBox, IconCut, IconBookmark, IconListCheck, IconUsers,
  IconClipboardList, IconChartBar, IconLayoutKanban, IconArrowsSort, IconCheck, IconLogout,
  IconChecklist,
} from '@tabler/icons-react'
import { useUserStore } from '../../stores/user'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { rawMaterialsApi } from '../../api/raw-materials'
import { initMachines } from '../../api/machines'
import { initRelaties } from '../../api/relaties'
import { initArticles } from '../../api/articles'
import { initProjects } from '../../api/projects'
import { initReservations, reservationsStore } from '../../api/reservations'
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
import { PlanningPage } from '../../routes/desktop/PlanningPage'
import { PlanningKanbanPage } from '../../routes/desktop/PlanningKanbanPage'
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

function Sidebar() {
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
        { to: '/planning-kanban', label: 'KanBan',   Icon: IconLayoutKanban, count: null },
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
  '/planning-kanban': ['Planning',       'KanBan'],
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
  const qc = useQueryClient()

  useEffect(() => {
    // Populate all in-memory caches from API on startup. These modules expose
    // a synchronous list()/listSync() read of an in-memory cache that starts
    // out seeded from localStorage (or hardcoded mock defaults) — pages that
    // read it via useQuery get that stale snapshot immediately on mount, and
    // nothing tells them to re-render once the real fetch below resolves.
    // Invalidate every query relying on these caches so they pick up the
    // real DB data as soon as it's in, instead of getting stuck showing
    // whatever was cached/seeded before this load.
    Promise.all([
      initMachines(),
      initRelaties(),
      initArticles(),
      initProjects(),
      initReservations(),
    ]).then(() => {
      qc.invalidateQueries({ queryKey: ['machines'] })
      qc.invalidateQueries({ queryKey: ['relaties'] })
      qc.invalidateQueries({ queryKey: ['articles'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['reservations'] })
    })
  }, [qc])

  return (
    <div className="st-app">
      <Sidebar />
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
            <Route path="/planning"        element={<PlanningPage />} />
            <Route path="/planning-kanban" element={<PlanningKanbanPage />} />
            <Route path="/prognose"        element={<PrognosePage />} />
            <Route path="/todos"           element={<TodosPage />} />
            <Route path="*"               element={<Navigate to="/voorraad" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
