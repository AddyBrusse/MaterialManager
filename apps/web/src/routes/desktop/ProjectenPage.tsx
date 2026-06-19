import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconPlus, IconDownload, IconFolder, IconDots, IconTrash,
  IconArrowUp, IconArrowDown, IconUsers, IconClipboardList,
  IconAlertTriangle, IconFileInvoice,
} from '@tabler/icons-react'
import { Menu } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { projectsApi, formatBedrag, formatDate, getProjectSubtotaal } from '../../api/projects'
import { relatiesApi } from '../../api/relaties'
import { useUserStore } from '../../stores/user'
import type { Project } from '@stockmanager/shared'

// ── Status config ─────────────────────────────────────────────────────────────

export const PROJECT_STATUS_CONFIG: Record<Project['status'], { label: string; cls: string }> = {
  concept:      { label: 'Concept',      cls: 'prj-neutral'     },
  offerte:      { label: 'Offerte',      cls: 'prj-offerte'     },
  bevestigd:    { label: 'Bevestigd',    cls: 'prj-bevestigd'   },
  productie:    { label: 'Productie',    cls: 'prj-productie'   },
  paklijst:     { label: 'Paklijst',     cls: 'prj-paklijst'    },
  verzonden:    { label: 'Verzonden',    cls: 'prj-verzonden'   },
  gefactureerd: { label: 'Gefactureerd', cls: 'prj-factureerd'  },
  on_hold:      { label: 'On Hold',      cls: 'prj-onhold'      },
  geannuleerd:  { label: 'Geannuleerd',  cls: 'prj-geannuleerd' },
}

// Stage index for the mini pipeline (0-based, matching the 7 main stages)
const STATUS_STAGE: Record<Project['status'], number> = {
  concept: 0, offerte: 1, bevestigd: 2, productie: 3,
  paklijst: 4, verzonden: 5, gefactureerd: 6,
  on_hold: -1, geannuleerd: -1,
}

function MiniPipeline({ status }: { status: Project['status'] }) {
  const activeIdx = STATUS_STAGE[status]
  return (
    <div className="prj-mp">
      {Array.from({ length: 7 }, (_, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div
              className={`prj-mp-line ${i <= activeIdx ? 'done' : activeIdx === i - 1 ? 'active' : 'pend'}`}
            />
          )}
          <div
            className={`prj-mp-step ${
              i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pend'
            }`}
          />
        </React.Fragment>
      ))}
    </div>
  )
}

function SortTh({ k, sort, onSort, align, children, style }: {
  k: string; sort: { key: string; dir: 'asc' | 'desc' }
  onSort: (k: string) => void; align?: string; children: React.ReactNode; style?: React.CSSProperties
}) {
  const active = sort.key === k
  return (
    <th style={{ textAlign: (align as any) || 'left', ...style }} onClick={() => onSort(k)}>
      <span className="sort">
        {children}
        {active && (sort.dir === 'asc' ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />)}
      </span>
    </th>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ProjectenPage() {
  const navigate = useNavigate()
  const user = useUserStore(s => s.user)
  const [, forceUpdate] = useState(0)
  const rerender = () => forceUpdate(n => n + 1)

  const projects = projectsApi.list()
  const relaties = relatiesApi.listSync()

  const [q, setQ] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterKlant, setFilterKlant] = useState('')
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' as 'asc' | 'desc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const klantOptions = useMemo(() => {
    const ids = [...new Set(projects.map(p => p.relatieId).filter(Boolean) as string[])]
    return ids.map(id => ({ id, naam: relaties.find(r => r.id === id)?.naam ?? id }))
  }, [projects, relaties])

  const filtered = useMemo(() => {
    let f = projects
    if (q) {
      const Q = q.toLowerCase()
      f = f.filter(p =>
        p.id.toLowerCase().includes(Q) ||
        p.naam.toLowerCase().includes(Q) ||
        (p.klantRef ?? '').toLowerCase().includes(Q) ||
        (relaties.find(r => r.id === p.relatieId)?.naam ?? '').toLowerCase().includes(Q),
      )
    }
    if (filterStatus) f = f.filter(p => p.status === filterStatus)
    if (filterKlant)  f = f.filter(p => p.relatieId === filterKlant)
    return [...f].sort((a, b) => {
      let av: any, bv: any
      if (sort.key === 'bedrag') {
        av = getProjectSubtotaal(a); bv = getProjectSubtotaal(b)
      } else if (sort.key === 'klant') {
        av = relaties.find(r => r.id === a.relatieId)?.naam ?? ''
        bv = relaties.find(r => r.id === b.relatieId)?.naam ?? ''
      } else {
        av = (a as any)[sort.key]; bv = (b as any)[sort.key]
      }
      const cmp = typeof av === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), 'nl')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [projects, q, filterStatus, filterKlant, sort, relaties])

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
            const p = projectsApi.create({ naam: '', relatieId: null, contactId: null, klantRef: null, levertijdDatum: null, notities: '' })
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
          <IconPlus size={14} style={{ opacity: 0.4 }} />
          <input
            placeholder="Zoek projectnr, naam, klant, ref…"
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
        <button className="st-btn ghost sm">Meer filters</button>
      </div>

      {/* Table */}
      <div className="st-table-wrap">
        <div className="st-tbl-scroll">
          <table className="st-tbl">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <span className="st-ck" data-on={allSel} onClick={toggleAll} />
                </th>
                <SortTh k="naam" sort={sort} onSort={toggleSort}>Project</SortTh>
                <SortTh k="klant" sort={sort} onSort={toggleSort}>Klant</SortTh>
                <th>Status</th>
                <th>Voortgang</th>
                <th style={{ width: 60, textAlign: 'right' }}>Art.</th>
                <SortTh k="bedrag" sort={sort} onSort={toggleSort} align="right">Bedrag excl.</SortTh>
                <SortTh k="createdAt" sort={sort} onSort={toggleSort}>Aangemaakt</SortTh>
                <th style={{ width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const cfg = PROJECT_STATUS_CONFIG[p.status]
                const klant = relaties.find(r => r.id === p.relatieId)
                const bedrag = getProjectSubtotaal(p)
                const artikelCount = p.offertes.find(o => o.status === 'geaccepteerd')?.regels.length
                  ?? p.offertes[p.offertes.length - 1]?.regels.length
                  ?? 0
                return (
                  <tr
                    key={p.id}
                    data-selected={selected.has(p.id)}
                    onClick={() => navigate(`/projecten/${p.id}`)}
                  >
                    <td className="col-checkbox" onClick={e => e.stopPropagation()}>
                      <span className="st-ck" data-on={selected.has(p.id)} onClick={() => toggleOne(p.id)} />
                    </td>
                    <td>
                      <div className="st-art-cell">
                        <div className="st-type-pic"><IconFolder size={15} /></div>
                        <div style={{ minWidth: 0 }}>
                          <div className="st-art-name">{p.naam}</div>
                          <div className="st-art-desc">
                            {p.id}
                            {p.klantRef ? ` · ref ${p.klantRef}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-strong" style={{ fontSize: 12.5 }}>
                        {klant?.naam ?? <span className="cell-muted">—</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`st-badge ${cfg.cls}`}>
                        <span className="dot" />{cfg.label}
                      </span>
                    </td>
                    <td><MiniPipeline status={p.status} /></td>
                    <td className="cell-num cell-muted">{artikelCount || '—'}</td>
                    <td className="cell-num cell-mono">
                      {bedrag > 0 ? formatBedrag(bedrag) : <span className="cell-muted">—</span>}
                    </td>
                    <td><span className="cell-muted">{formatDate(p.createdAt)}</span></td>
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
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="st-empty">
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
