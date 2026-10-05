import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconPlus, IconDownload, IconDots, IconTrash, IconFolder,
  IconArrowUp, IconArrowDown, IconUsers,
} from '@tabler/icons-react'
import { Menu } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { projectsApi, herlaadProjecten } from '../../api/projects'
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
import { companyApi } from '../../api/company'
import { heeftSignaal, signalenVan, type Signalen, type SignaalId } from '../../components/projecten/overzicht/signalen'
import { pastAlle, wisselSignaal, type Filter, type FilterCtx } from '../../components/projecten/overzicht/filters'
import { ProjectTegels, type TegelTellingen } from '../../components/projecten/overzicht/ProjectTegels'
import { FilterBalk } from '../../components/projecten/overzicht/FilterBalk'
import { getProjectSubtotaal } from '../../api/projects'

// PROJECT_STATUS_CONFIG moved to components/projecten/projectColumns so the
// column registry can own status display; re-exported here because the detail
// page has always imported it from this module.
export { PROJECT_STATUS_CONFIG } from '../../components/projecten/projectColumns'

// Used until the user saves a layout of their own; `hidden` seeds from the
// registry's defaultVisible flags, so the niche columns start collapsed.
const DEFAULT_PREFS: ProjectTablePrefs = { order: [], hidden: DEFAULT_HIDDEN, colors: {} }

const DEFAULT_SORT = { key: 'aangemaakt', dir: 'desc' as 'asc' | 'desc' }

/** Kolommen die er vóór de `gezien`-lijst (2026-10-05) nog niet waren. */
const NIEUW_2026_10_05 = ['teFactureren', 'openstaand', 'pakbonnen', 'facturen']

/** A stored preference from an older shape (or hand-edited) shouldn't crash the page. */
function normalizePrefs(raw: ProjectTablePrefs | null | undefined): ProjectTablePrefs {
  const hidden = Array.isArray(raw?.hidden) ? raw.hidden : DEFAULT_HIDDEN
  // Een nieuwe, standaard verborgen kolom is ook verborgen bij wie al een eigen
  // indeling had. Wat de indeling kende staat in `gezien`; een oude indeling
  // zonder die lijst kende alles behalve de kolommen van 2026-10-05.
  const gezien = Array.isArray(raw?.gezien)
    ? raw.gezien
    : PROJECT_COLUMNS.map(c => c.id).filter(id => !NIEUW_2026_10_05.includes(id))
  const nieuwVerborgen = raw
    ? PROJECT_COLUMNS.filter(c => !c.defaultVisible && !gezien.includes(c.id) && !hidden.includes(c.id)).map(c => c.id)
    : []
  return {
    order:  Array.isArray(raw?.order) ? raw.order : [],
    hidden: [...hidden, ...nieuwVerborgen],
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
  // Elke 30 s de lijst van de server, zodat voortgang uit de hal en projecten
  // van een collega zonder F5 verschijnen (2026-10-01).
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      await herlaadProjecten()
      return projectsApi.list()
    },
    refetchInterval: 30_000,
  })
  const relaties = relatiesApi.listSync()

  // Column layout is per user and lives server-side, so it follows whoever is
  // selected in the user dropdown across machines.
  const { value: rawPrefs, setValue: setPrefs, reset: resetPrefs, isLoading: prefsLoading } =
    useUserPreference<ProjectTablePrefs>(PROJECT_TABLE_PREFS_KEY, DEFAULT_PREFS)
  const prefs = normalizePrefs(rawPrefs)
  // Updaters see the normalised shape, never a malformed stored blob.
  const updatePrefs = (updater: (prev: ProjectTablePrefs) => ProjectTablePrefs) =>
    setPrefs(prev => ({ ...updater(normalizePrefs(prev)), gezien: PROJECT_COLUMNS.map(c => c.id) }))

  const [q, setQ] = useState('')
  // De filterbalk (2026-10-05): tegels en "+ Filter" zetten er chips in.
  const [filters, setFilters] = useState<Filter[]>([])
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

  const nabelDagen = companyApi.getSync().offerteNabelDagen ?? 21
  const keuzes = useMemo(() => {
    const ids = [...new Set(projects.map(p => p.relatieId).filter(Boolean) as string[])]
    const klanten = ids.map(id => ({ id, naam: relaties.find(r => r.id === id)?.naam ?? id }))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
    const contactIds = new Set(projects.map(p => p.contactId).filter(Boolean) as string[])
    const contacten = relaties.flatMap(r => r.contacten
      .filter(c => contactIds.has(c.id))
      .map(c => ({ id: c.id, naam: `${c.naam} (${r.naam})` })))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
    return { klanten, contacten }
  }, [projects, relaties])

  // Eén keer per project uitgerekend: tegels, filters en kolommen lezen hieruit.
  const signalen = useMemo(() => {
    const nu = new Date()
    return new Map(projects.map(p => [p.id, signalenVan(p, nu, nabelDagen)]))
  }, [projects, nabelDagen])

  const filterCtx: FilterCtx = useMemo(() => ({
    nu: new Date(),
    signalen: (p: Project) => signalen.get(p.id) ?? signalenVan(p, new Date(), nabelDagen),
    bedrag: (p: Project) => getProjectSubtotaal(p),
    klantNaam: (id: string) => relaties.find(r => r.id === id)?.naam ?? '',
    contactNaam: (id: string) => {
      for (const r of relaties) {
        const c = r.contacten.find(x => x.id === id)
        if (c) return c.naam
      }
      return ''
    },
  }), [signalen, relaties, nabelDagen])

  // Zoeken en alle filters behalve de tegels: hierover tellen de tegels, zodat
  // "Klant: X" ook de cijfers op de tegels naar die klant brengt.
  const basis = useMemo(() => {
    let f = projects
    if (q) {
      const Q = q.toLowerCase()
      f = f.filter(p => PROJECT_COLUMNS.some(col => col.searchText(p, ctx).toLowerCase().includes(Q)))
    }
    const overig = filters.filter(x => x.soort !== 'signaal')
    return overig.length ? f.filter(p => pastAlle(p, overig, filterCtx)) : f
  }, [projects, q, filters, ctx, filterCtx])

  const tellingen: TegelTellingen = useMemo(() => {
    const met = (id: SignaalId) => basis.filter(p => heeftSignaal(signalen.get(p.id) as Signalen, id))
    const som = (lijst: Project[], veld: 'teLeveren' | 'teFactureren' | 'openstaand') =>
      lijst.reduce((t, p) => t + (signalen.get(p.id)?.[veld] ?? 0), 0)
    const leveren = met('teLeveren')
    const factureren = met('teFactureren')
    const open = met('openstaand')
    return {
      geenReactie: met('geenReactie').length,
      overLevertijd: met('overLevertijd').length,
      teLeveren: { projecten: leveren.length, stuks: som(leveren, 'teLeveren') },
      teFactureren: { projecten: factureren.length, bedrag: som(factureren, 'teFactureren') },
      openstaand: {
        projecten: open.length,
        bedrag: som(open, 'openstaand'),
        vervallen: basis.reduce((t, p) => t + (signalen.get(p.id)?.vervallen ?? 0), 0),
      },
    }
  }, [basis, signalen])

  const filtered = useMemo(() => {
    // Zoeken loopt over alle kolommen, ook verborgen ones (in `basis`), zodat een
    // verborgen kolom een project nooit onvindbaar maakt. Daarna de tegels.
    const tegels = filters.filter(x => x.soort === 'signaal')
    const f = tegels.length ? basis.filter(p => pastAlle(p, tegels, filterCtx)) : basis

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
  }, [basis, filters, filterCtx, sort, ctx, columns])

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

      <ProjectTegels
        t={tellingen}
        nabelDagen={nabelDagen}
        actief={id => filters.some(f => f.soort === 'signaal' && f.signaal === id)}
        onWissel={id => setFilters(f => wisselSignaal(f, id))}
      />

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

        <FilterBalk
          filters={filters}
          onFilters={setFilters}
          keuzes={keuzes}
          nabelDagen={nabelDagen}
          klantNaam={filterCtx.klantNaam}
          contactNaam={filterCtx.contactNaam}
        />

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
