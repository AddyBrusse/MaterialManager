import { useState, useEffect } from 'react'
import { NavLink, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import {
  IconLayersLinked, IconInbox, IconSettings, IconList,
  IconChevronDown, IconBell, IconBox, IconCut, IconBookmark, IconListCheck, IconUsers,
  IconClipboardList, IconCalendarEvent, IconTimeline, IconChartBar,
} from '@tabler/icons-react'
import { useUserStore } from '../../stores/user'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { rawMaterialsApi } from '../../api/raw-materials'
import { initMachines } from '../../api/machines'
import { initRelaties } from '../../api/relaties'
import { initArticles } from '../../api/articles'
import { initProjects } from '../../api/projects'
import { initReservations, reservationsStore } from '../../api/reservations'
import { VoorraadPage } from '../../routes/desktop/VoorraadPage'
import { ArtikelenPage } from '../../routes/desktop/ArtikelenPage'
import { ArtikelDetailPage } from '../../routes/desktop/ArtikelDetailPage'
import { BinnenBoekenPage } from '../../routes/desktop/BinnenBoekenPage'
import { InstellingenPage } from '../../routes/desktop/InstellingenPage'
import { ZaagCalculatorPage } from '../../routes/desktop/ZaagCalculatorPage'
import { ReserveringenPage } from '../../routes/desktop/ReserveringenPage'
import { ZaagflowPage } from '../../routes/desktop/ZaagflowPage'
import { RelatiesPage } from '../../routes/desktop/RelatiesPage'
import { RelatieDetailPage } from '../../routes/desktop/RelatieDetailPage'
import { ProjectenPage } from '../../routes/desktop/ProjectenPage'
import { ProjectDetailPage } from '../../routes/desktop/ProjectDetailPage'
import { PlanningPage } from '../../routes/desktop/PlanningPage'
import { PlanningGanttPage } from '../../routes/desktop/PlanningGanttPage'
import { PrognosePage } from '../../routes/desktop/PrognosePage'

function getInitials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Sidebar() {
  const { user, clearUser } = useUserStore()
  const location = useLocation()

  // Live counts
  const { data: rawData } = useQuery({ queryKey: ['raw-materials'], queryFn: rawMaterialsApi.list })
  const voorraadCount = rawData?.data?.length ?? 0

  const [reservationCount, setReservationCount] = useState(() => reservationsStore.list().length)
  useEffect(() => {
    setReservationCount(reservationsStore.list().length)
  }, [location.pathname])

  const NAV = [
    {
      label: 'Materiaal beheer',
      items: [
        { to: '/voorraad',     label: 'Voorraad',      Icon: IconLayersLinked, count: voorraadCount || null },
        { to: '/binnenboeken', label: 'Binnen boeken',  Icon: IconInbox,        count: null },
        { to: '/instellingen', label: 'Instellingen',   Icon: IconSettings,     count: null },
      ],
    },
    {
      label: 'Artikelen',
      items: [
        { to: '/artikelen', label: 'Artikelen', Icon: IconList,  count: null },
        { to: '/relaties',  label: 'Relaties',  Icon: IconUsers, count: null },
      ],
    },
    {
      label: 'Productie',
      items: [
        { to: '/zaagcalculator',  label: 'Zaag calculator', Icon: IconCut,       count: null },
        { to: '/reserveringen',   label: 'Reserveringen',   Icon: IconBookmark,  count: reservationCount || null },
        { to: '/zaagflow',        label: 'Zaagflow',        Icon: IconListCheck,      count: null },
        { to: '/projecten',       label: 'Projecten',       Icon: IconClipboardList,  count: null },
        { to: '/planning',        label: 'Planning',        Icon: IconCalendarEvent,  count: null },
        { to: '/planning-gantt',  label: 'Planning (Gantt)', Icon: IconTimeline,      count: null },
        { to: '/prognose',        label: 'Prognose',        Icon: IconChartBar,      count: null },
      ],
    },
  ]

  const initials = user ? getInitials(user.name) : '?'
  const role = user?.role === 'admin' ? 'Beheerder' : 'Operator'

  return (
    <aside className="st-sidebar">
      <div className="st-sb-brand">
        <div className="st-sb-brand-mark">ST</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="st-sb-brand-name">StaalTrack</div>
          <div className="st-sb-brand-sub">Voorraadbeheer</div>
        </div>
      </div>

      <div className="st-sb-org">
        <span className="dot"></span>
        <span>Van Dijk Staal B.V.</span>
        <span className="chev"><IconChevronDown size={12} /></span>
      </div>

      <nav className="st-sb-nav">
        {NAV.map((group) => (
          <div key={group.label}>
            <div className="st-sb-group-lbl">{group.label}</div>
            {group.items.map((item) => (
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
  '/voorraad':        ['Materiaal beheer', 'Voorraad'],
  '/binnenboeken':    ['Materiaal beheer', 'Binnen boeken'],
  '/instellingen':    ['Materiaal beheer', 'Instellingen'],
  '/artikelen':       ['Artikelen',        'Artikelen'],
  '/relaties':        ['Artikelen',        'Relaties'],
  '/zaagcalculator':  ['Productie',        'Zaag calculator'],
  '/reserveringen':   ['Productie',        'Reserveringen'],
  '/zaagflow':        ['Productie',        'Zaagflow'],
  '/projecten':       ['Productie',        'Projecten'],
  '/planning':        ['Productie',        'Planning'],
  '/planning-gantt':  ['Productie',        'Planning (Gantt)'],
  '/prognose':        ['Productie',        'Prognose'],
}

function Topbar() {
  const location = useLocation()
  const detail = location.pathname.startsWith('/artikelen/')
    ? (['Artikelen', 'Artikel'] as [string, string])
    : location.pathname.startsWith('/projecten/')
    ? (['Productie', 'Project detail'] as [string, string])
    : location.pathname.startsWith('/relaties/')
    ? (['Artikelen', 'Relatie detail'] as [string, string])
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
            <Route path="/zaagflow"        element={<ZaagflowPage />} />
            <Route path="/relaties"        element={<RelatiesPage />} />
            <Route path="/relaties/:id"    element={<RelatieDetailPage />} />
            <Route path="/projecten"       element={<ProjectenPage />} />
            <Route path="/projecten/:id"   element={<ProjectDetailPage />} />
            <Route path="/planning"        element={<PlanningPage />} />
            <Route path="/planning-gantt"  element={<PlanningGanttPage />} />
            <Route path="/prognose"        element={<PrognosePage />} />
            <Route path="*"               element={<Navigate to="/voorraad" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
