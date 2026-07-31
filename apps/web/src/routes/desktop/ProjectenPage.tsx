import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconPlus, IconDownload, IconFolder, IconDots, IconTrash,
  IconArrowUp, IconArrowDown, IconUsers, IconClipboardList,
  IconAlertTriangle, IconFileInvoice,
} from '@tabler/icons-react'
import { Menu } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { projectsApi } from '../../api/projects'
import { relatiesApi } from '../../api/relaties'
import { useUserPreference } from '../../hooks/useUserPreference'
import { ColumnSettings } from '../../components/projecten/ColumnSettings'
import { ColumnHeaderMenu } from '../../components/projecten/ColumnHeaderMenu'
import {
  PROJECT_STATUS_CONFIG, PROJECT_COLUMNS, COLUMN_BY_ID, DEFAULT_HIDDEN,
  resolveColumns, reorderColumns,
  type ProjectColumnCtx,
} from '../../components/projecten/projectColumns'
import { PROJECT_TABLE_PREFS_KEY, type ProjectTablePrefs, type Project } from '@stockmanager/shared'

// PROJECT_STATUS_CONFIG moved to components/projecten/projectColumns so the
// column registry can own status display; re-exported here because the detail
// page has always imported it from this module.
export { PROJECT_STATUS_CONFIG } from '../../components/projecten/projectColumns'

// Used until the user saves a layout of their own; `hidden` seeds from the
// registry's defaultVisible flags, so the niche columns start collapsed.
const DEFAULT_PREFS: ProjectTablePrefs = { order: [], hidden: DEFAULT_HIDDEN, colors: {} }

const DEFAULT_SORT = { key: 'aangemaakt', dir: 'desc' as 'asc' | 'desc' }

/** A stored preference from an older shape (or hand-edited) shouldn't crash the page. */
function normalizePrefs(raw: ProjectTablePrefs | null | undefined): ProjectTablePrefs {
  return {
    order:  Array.isArray(raw?.order) ? raw.order : [],
    hidden: Array.isArray(raw?.hidden) ? raw.hidden : DEFAULT_HIDDEN,
    colors: (raw?.colors && typeof raw.colors === 'object' && !Array.isArray(raw.colors)) ? raw.colors : {},
  }
}

function SortIndicator({ dir }: { dir: 'asc' | 'desc' }) {
  return dir === 'asc' ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ProjectenPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [, forceUpdate] = useState(0)
  const rerender = () => { forceUpdate(n => n + 1); qc.invalidateQueries({ queryKey: ['projects'] }) }

  // projectsApi.list() reads a synchronous in-memory cache that's only
  // populated once the background initProjects() fetch resolves — without
  // going through useQuery, this page never re-renders once that happens,
  // so it can get stuck showing whatever was cached/seeded at first paint.
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() })
  const relaties = relatiesApi.listSync()

  // Column layout is per user and lives server-side, so it follows whoever is
  // selected in the user dropdown across machines.
  const { value: rawPrefs, setValue: setPrefs, reset: resetPrefs, isLoading: prefsLoading } =
    useUserPreference<ProjectTablePrefs>(PROJECT_TABLE_PREFS_KEY, DEFAULT_PREFS)
  const prefs = normalizePrefs(rawPrefs)
  // Updaters see the normalised shape, never a malformed stored blob.
  const updatePrefs = (updater: (prev: ProjectTablePrefs) => ProjectTablePrefs) =>
    setPrefs(prev => updater(normalizePrefs(prev)))

  const [q, setQ] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterKlant, setFilterKlant] = useState('')
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Header drag-to-reorder + the shared Kolommen panel, which a header menu can open.
  const [dragCol, setDragCol] = useState<string | null>(null)
  const [dropCol, setDropCol] = useState<string | null>(null)
  const [colPanelOpen, setColPanelOpen] = useState(false)

  function handleHeaderDrop(targetId: string) {
    const moved = dragCol
    setDragCol(null)
    setDropCol(null)
    if (!moved || moved === targetId) return
    updatePrefs(prev => ({ ...prev, order: reorderColumns(prev.order, moved, targetId) }))
  }

  const columns = useMemo(() => resolveColumns(prefs.order, prefs.hidden), [prefs.order, prefs.hidden])

  // Lookups the column renderers need, resolved once per render.
  const ctx: ProjectColumnCtx = useMemo(() => {
    const byId = new Map(relaties.map(r => [r.id, r]))
    return {
      klantNaam: (p: Project) => (p.relatieId ? byId.get(p.relatieId)?.naam ?? '' : ''),
      contactNaam: (p: Project) => {
        if (!p.relatieId || !p.contactId) return ''
        return byId.get(p.relatieId)?.contacten.find(c => c.id === p.contactId)?.naam ?? ''
      },
    }
  }, [relaties])

  const klantOptions = useMemo(() => {
    const ids = [...new Set(projects.map(p => p.relatieId).filter(Boolean) as string[])]
    return ids.map(id => ({ id, naam: relaties.find(r => r.id === id)?.naam ?? id }))
  }, [projects, relaties])

  const filtered = useMemo(() => {
    let f = projects
    if (q) {
      const Q = q.toLowerCase()
      // Search every column the registry knows about — including ones the user
      // has hidden, so a hidden column never makes a project unfindable.
      f = f.filter(p =>
        PROJECT_COLUMNS.some(col => col.searchText(p, ctx).toLowerCase().includes(Q)),
      )
    }
    if (filterStatus) f = f.filter(p => p.status === filterStatus)
    if (filterKlant)  f = f.filter(p => p.relatieId === filterKlant)

    // Only sort by a column that's actually on screen — otherwise hiding the
    // sorted column leaves the rows in an order with no visible explanation.
    const col = columns.find(c => c.id === sort.key) ?? COLUMN_BY_ID[DEFAULT_SORT.key]
    if (!col) return f
    return [...f].sort((a, b) => {
      const av = col.sortValue(a, ctx)
      const bv = col.sortValue(b, ctx)
      // Empty values always sink to the bottom, whichever way you sort.
      if (av === null || av === '') return bv === null || bv === '' ? 0 : 1
      if (bv === null || bv === '') return -1
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'nl', { numeric: true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [projects, q, filterStatus, filterKlant, sort, ctx])

  const stats = useMemo(() => ({
    total:        projects.filter(p => p.status !== 'geannuleerd').length,
    inProductie:  projects.filter(p => p.status === 'productie').length,
    openOffertes: projects.filter(p => p.status === 'offerte').length,
    openFacturen: projects.filter(p => p.status === 'verzonden').length,
  }), [projects])

  function toggleSort(key: string) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  const allSel = filtered.length > 0 && filtered.every(p => selected.has(p.id))
  const toggleAll = () => {
    const next = new Set(selected)
    allSel ? filtered.forEach(p => next.delete(p.id)) : filtered.forEach(p => next.add(p.id))
    setSelected(next)
  }
  const toggleOne = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  function handleDelete(p: Project) {
    if (!window.confirm(`Project ${p.id} (${p.naam}) verwijderen?`)) return
    projectsApi.remove(p.id)
    notifications.show({ color: 'orange', message: `Project ${p.id} verwijderd` })
    rerender()
  }

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Projecten</div>
          <div className="st-page-sub">Offerte- en productiebeheer per klantorder</div>
        </div>
        <div className="st-page-actions">
          <button className="st-btn"><IconDownload size={14} />Exporteer</button>
          <button className="st-btn primary" onClick={() => {
            const p = projectsApi.create({ naam: 'Nieuw project', relatieId: null, contactId: null, klantRef: null, levertijdDatum: null, notities: '' })
            qc.invalidateQueries({ queryKey: ['projects'] })
            navigate(`/projecten/${p.id}`)
          }}>
            <IconPlus size={14} />Nieuw project
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="st-stats" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="st-stat">
          <div className="st-stat-lbl"><IconClipboardList size={13} />Actieve projecten</div>
          <div className="st-stat-val">{stats.total}</div>
          <div className="st-stat-foot"><span>alle statussen</span></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-lbl"><IconFolder size={13} />In productie</div>
          <div className="st-stat-val">{stats.inProductie}</div>
          <div className="st-stat-foot"><span>stappen lopen</span></div>
        </div>
        <div className="st-stat" style={stats.openOffertes > 0 ? { borderColor: 'var(--warning-soft)' } : {}}>
          <div className="st-stat-lbl" style={stats.openOffertes > 0 ? { color: 'var(--warning)' } : {}}>
            <IconAlertTriangle size={13} />Open offertes
          </div>
          <div className="st-stat-val" style={stats.openOffertes > 0 ? { color: 'var(--warning)' } : {}}>
            {stats.openOffertes}
          </div>
          <div className="st-stat-foot"><span>wacht op klant</span></div>
        </div>
        <div className="st-stat" style={stats.openFacturen > 0 ? { borderColor: 'var(--warning-soft)' } : {}}>
          <div className="st-stat-lbl" style={stats.openFacturen > 0 ? { color: 'var(--warning)' } : {}}>
            <IconFileInvoice size={13} />Open facturen
          </div>
          <div className="st-stat-val" style={stats.openFacturen > 0 ? { color: 'var(--warning)' } : {}}>
            {stats.openFacturen}
          </div>
          <div className="st-stat-foot"><span>versturen</span></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="st-toolbar">
        <div className="st-search">
          <IconUsers size={14} />
          <input
            placeholder="Zoek in alle kolommen…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {/* Klant filter */}
        <label className={`st-chip${filterKlant ? ' active' : ''}`}>
          {!filterKlant && <IconPlus size={11} />}
          <span>Klant</span>
          {filterKlant && <span className="chip-val">: {klantOptions.find(k => k.id === filterKlant)?.naam}</span>}
          <select value={filterKlant} onChange={e => setFilterKlant(e.target.value)}>
            <option value="">Alle klanten</option>
            {klantOptions.map(k => <option key={k.id} value={k.id}>{k.naam}</option>)}
          </select>
          {filterKlant && <span className="chip-x" onClick={e => { e.preventDefault(); setFilterKlant('') }}>×</span>}
        </label>

        {/* Status filter */}
        <label className={`st-chip${filterStatus ? ' active' : ''}`}>
          {!filterStatus && <IconPlus size={11} />}
          <span>Status</span>
          {filterStatus && <span className="chip-val">: {PROJECT_STATUS_CONFIG[filterStatus as Project['status']]?.label}</span>}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Alle statussen</option>
            <option value="concept">Concept</option>
            <option value="offerte">Offerte</option>
            <option value="bevestigd">Bevestigd</option>
            <option value="productie">Productie</option>
            <option value="paklijst">Paklijst</option>
            <option value="verzonden">Verzonden</option>
            <option value="gefactureerd">Gefactureerd</option>
            <option value="on_hold">On Hold</option>
            <option value="geannuleerd">Geannuleerd</option>
          </select>
          {filterStatus && <span className="chip-x" onClick={e => { e.preventDefault(); setFilterStatus('') }}>×</span>}
        </label>

        <div style={{ flex: 1 }} />

        {/* Far right of the filter row, directly above the table it configures.
            Disabled until the saved layout has loaded — editing before then
            would base the change on the defaults and overwrite it. */}
        <ColumnSettings
          prefs={prefs}
          onChange={updatePrefs}
          onReset={resetPrefs}
          disabled={prefsLoading}
          open={colPanelOpen}
          onOpenChange={setColPanelOpen}
        />
      </div>

      {/* Table */}
      <div className="st-table-wrap">
        <div className="st-tbl-scroll">
          <table className="st-tbl prj-tbl">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <span className="st-ck" data-on={allSel} onClick={toggleAll} />
                </th>
                {columns.map(col => (
                  <th
                    key={col.id}
                    data-tint={prefs.colors[col.id] || undefined}
                    data-align={col.align ?? 'left'}
                    className={dragCol === col.id ? 'dragging' : dropCol === col.id ? 'drop-target' : undefined}
                    style={{ textAlign: col.align ?? 'left', minWidth: col.width }}
                    title={col.longLabel ?? col.label}
                    // A real drag suppresses the click, so drag-to-reorder and
                    // click-to-sort can share the header without a threshold.
                    draggable
                    onDragStart={e => {
                      setDragCol(col.id)
                      e.dataTransfer.effectAllowed = 'move'
                      try { e.dataTransfer.setData('text/plain', col.id) } catch { /* ignore */ }
                    }}
                    onDragEnd={() => { setDragCol(null); setDropCol(null) }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropCol(col.id) }}
                    onDragLeave={() => setDropCol(c => (c === col.id ? null : c))}
                    onDrop={e => { e.preventDefault(); handleHeaderDrop(col.id) }}
                    onClick={() => toggleSort(col.id)}
                  >
                    <span className="th-inner">
                    <span className="sort">
                      {col.label}
                      {sort.key === col.id && <SortIndicator dir={sort.dir} />}
                    </span>
                    <ColumnHeaderMenu
                      col={col}
                      tint={prefs.colors[col.id] ?? ''}
                      onTint={t => updatePrefs(prev => {
                        const colors = { ...prev.colors }
                        if (t) colors[col.id] = t; else delete colors[col.id]
                        return { ...prev, colors }
                      })}
                      onSort={dir => setSort({ key: col.id, dir })}
                      onHide={() => updatePrefs(prev => {
                        const hidden = prev.hidden.includes(col.id) ? prev.hidden : [...prev.hidden, col.id]
                        return resolveColumns(prev.order, hidden).length === 0 ? prev : { ...prev, hidden }
                      })}
                      onOpenPanel={() => setColPanelOpen(true)}
                    />
                    </span>
                  </th>
                ))}
                <th style={{ width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr
                  key={p.id}
                  data-selected={selected.has(p.id)}
                  onClick={() => navigate(`/projecten/${p.id}`)}
                >
                  <td className="col-checkbox" onClick={e => e.stopPropagation()}>
                    <span className="st-ck" data-on={selected.has(p.id)} onClick={() => toggleOne(p.id)} />
                  </td>
                  {columns.map(col => (
                    <td
                      key={col.id}
                      data-tint={prefs.colors[col.id] || undefined}
                      className={col.align === 'right' ? 'cell-num' : undefined}
                    >
                      {col.render(p, ctx)}
                    </td>
                  ))}
                  <td onClick={e => e.stopPropagation()}>
                    <Menu position="bottom-end" withinPortal shadow="md">
                      <Menu.Target>
                        <button className="st-icon-btn" title="Acties"><IconDots size={15} /></button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconFolder size={14} />} onClick={() => navigate(`/projecten/${p.id}`)}>
                          Openen
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => handleDelete(p)}
                        >
                          Verwijderen
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} className="st-empty">
                    {projects.length === 0
                      ? 'Nog geen projecten. Maak een nieuw project aan.'
                      : 'Geen projecten gevonden voor deze filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="st-tbl-foot">
          <span>{filtered.length} van {projects.length} projecten</span>
          {selected.size > 0 && <span style={{ color: 'var(--text)' }}>· {selected.size} geselecteerd</span>}
        </div>
      </div>
    </>
  )
}
