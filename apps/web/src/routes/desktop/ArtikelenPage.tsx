import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Menu } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconDownload, IconUpload, IconPlus, IconAlertTriangle,
  IconList, IconUser, IconPackage, IconArrowUp, IconArrowDown, IconDots,
  IconMinus, IconPencil, IconTrash,
} from '@tabler/icons-react'
import { articlesApi, KNOWN_OPERATIONS, type Article, type ArticleEstimate } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { formatDimensions } from '../../api/raw-materials'
import { buildEstimateCtx, computeEstimateTotals, type EstimateTotals } from '../../api/estimate'
import { useUserStore } from '../../stores/user'
import { ArticleForm } from '../../components/articles/ArticleForm'

const EMPTY_ESTIMATE: ArticleEstimate = { marginPct: 0, nodes: [], updatedAt: '' }
const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── helpers ───────────────────────────────────────────────────────────────────
function statusForArt(it: Article) {
  if (it.currentStock === 0)                                      return { tag: 'uit',  label: 'Uit',         cls: 'danger' }
  if (it.minStock != null && it.currentStock < it.minStock)      return { tag: 'laag', label: 'Laag',        cls: 'warn'   }
  if (it.maxStock != null && it.currentStock >= it.maxStock * 0.85) return { tag: 'vol',  label: 'Vol',       cls: 'info'   }
  return                                                                 { tag: 'ok',   label: 'Op voorraad', cls: 'ok'     }
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

function FilterChip({ label, value, options, onChange }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  const active = value !== ''
  const opt = options.find(([v]) => v === value)
  return (
    <label className={`st-chip${active ? ' active' : ''}`}>
      {!active && <IconPlus size={11} />}
      <span>{label}</span>
      {active && <span className="chip-val">: {opt?.[1]}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {active && <span className="chip-x" onClick={(e) => { e.preventDefault(); onChange('') }}>×</span>}
    </label>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────
export function ArtikelenPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isAdmin = useUserStore(s => s.user?.role === 'admin')

  const { data: articles = [] } = useQuery({ queryKey: ['articles'], queryFn: () => articlesApi.list() })
  const { data: gradesData }    = useQuery({ queryKey: ['grades'],   queryFn: gradesApi.list })
  const { data: profilesData }  = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const { data: machinesData }  = useQuery({ queryKey: ['machines'], queryFn: machinesApi.list })

  const gradeName = useMemo(() => {
    const m = new Map((gradesData?.data ?? []).map(g => [g.id, g.name]))
    return (id: string) => m.get(id) ?? id
  }, [gradesData])
  const profileById = useMemo(() => {
    const m = new Map((profilesData?.data ?? []).map(p => [p.id, p]))
    return (id: string) => m.get(id)
  }, [profilesData])

  // Per-article cost breakdown (materiaal / bewerking / uitbesteding / marge / totaal)
  // for the extra list columns — same calc as the article detail page.
  const totalsByArticle = useMemo(() => {
    const grades = gradesData?.data ?? []
    const profiles = profilesData?.data ?? []
    const machines = machinesData?.data ?? []
    const m = new Map<string, EstimateTotals>()
    for (const a of articles) {
      const ctx = buildEstimateCtx(a, grades, profiles.map(p => ({ id: p.id, volumeFormula: p.volumeFormula })), machines)
      m.set(a.id, computeEstimateTotals(a.estimate ?? EMPTY_ESTIMATE, ctx))
    }
    return m
  }, [articles, gradesData, profilesData, machinesData])
  const totalsOf = (id: string): EstimateTotals =>
    totalsByArticle.get(id) ?? { materialTotal: 0, machiningTotal: 0, externalTotal: 0, cost: 0, marginPct: 0, sell: 0, timeMin: 0 }

  function formatRecipe(a: Article): { text: string; grade: string } | null {
    if (!a.recipe) return null
    const p = profileById(a.recipe.profileId)
    const dims = p ? formatDimensions(p, a.recipe.dimensions) : ''
    return { text: `${p?.name ?? '?'} ${dims}`.trim(), grade: gradeName(a.recipe.gradeId) }
  }

  const [q, setQ]               = useState('')
  const [klant, setKlant]       = useState('')
  const [bewerking, setBewerking] = useState('')
  const [status, setStatus]     = useState('')
  const [sort, setSort]         = useState({ key: 'id', dir: 'asc' as 'asc' | 'desc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editItem, setEditItem] = useState<Article | null>(null)

  function handleNieuwArtikel() {
    const blank = articlesApi.create({
      naam: 'Nieuw artikel', klant: null, relatieId: null, contactId: null, tekening: null, rev: null,
      drawingPath: null, photoPath: null, recipe: null,
      operations: [], notes: { workholding: '', general: '' },
      attachments: [], estimate: null, locatie: null,
      currentStock: 0, minStock: null, maxStock: null,
    })
    qc.invalidateQueries({ queryKey: ['articles'] })
    navigate(`/artikelen/${blank.id}`)
  }

  const customers = useMemo(
    () => [...new Set(articles.map(a => a.klant).filter(Boolean) as string[])],
    [articles]
  )

  const filtered = useMemo(() => {
    let f = articles
    if (q) {
      const Q = q.toLowerCase()
      f = f.filter(it =>
        it.naam.toLowerCase().includes(Q) ||
        it.id.toLowerCase().includes(Q) ||
        (it.klant ?? '').toLowerCase().includes(Q) ||
        (it.tekening ?? '').toLowerCase().includes(Q)
      )
    }
    if (klant)     f = f.filter(it => it.klant === klant)
    if (bewerking) f = f.filter(it => it.operations.some(o => o.type === bewerking))
    if (status)    f = f.filter(it => statusForArt(it).tag === status)
    const TOTALS_KEYS: Record<string, keyof EstimateTotals> = {
      totaalPrijs: 'sell', bewerkingKosten: 'machiningTotal', materiaalKosten: 'materialTotal',
      uitbestedingKosten: 'externalTotal', marge: 'marginPct',
    }
    return [...f].sort((a, b) => {
      const get = (it: Article) => {
        if (sort.key === 'voorraad') return it.currentStock
        const totalsKey = TOTALS_KEYS[sort.key]
        if (totalsKey) return totalsOf(it.id)[totalsKey]
        return (it as any)[sort.key]
      }
      const av = get(a), bv = get(b)
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'nl')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [articles, q, klant, bewerking, status, sort, totalsByArticle])

  const stats = useMemo(() => ({
    total:       articles.length,
    klanten:     new Set(articles.map(a => a.klant).filter(Boolean)).size,
    onderMin:    articles.filter(a => a.minStock != null && a.currentStock < a.minStock).length,
    zonderRecept: articles.filter(a => !a.recipe).length,
  }), [articles])

  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })

  const allSelected = filtered.length > 0 && filtered.every(it => selected.has(it.id))
  const toggleAll = () => {
    const next = new Set(selected)
    allSelected ? filtered.forEach(it => next.delete(it.id)) : filtered.forEach(it => next.add(it.id))
    setSelected(next)
  }
  const toggleOne = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  function handleDelete(a: Article) {
    if (!window.confirm(`Artikel ${a.id} (${a.naam}) verwijderen?`)) return
    articlesApi.remove(a.id)
    qc.invalidateQueries({ queryKey: ['articles'] })
    notifications.show({ color: 'orange', message: `Artikel ${a.id} verwijderd` })
  }

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Artikelen</div>
          <div className="st-page-sub">Klantspecifieke artikelen die wij op voorraad maken om levertijd te verkorten</div>
        </div>
        <div className="st-page-actions">
          <button className="st-btn"><IconDownload size={14} />Exporteer</button>
          <button className="st-btn"><IconUpload size={14} />Import</button>
          {isAdmin && (
            <button className="st-btn primary" onClick={handleNieuwArtikel}><IconPlus size={14} />Nieuw artikel</button>
          )}
        </div>
      </div>

      <div className="st-stats">
        <div className="st-stat">
          <div className="st-stat-lbl"><IconList size={13} />Actieve artikelen</div>
          <div className="st-stat-val">{stats.total}</div>
          <div className="st-stat-foot"><span>in de catalogus</span></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-lbl"><IconUser size={13} />Klanten</div>
          <div className="st-stat-val">{stats.klanten}</div>
          <div className="st-stat-foot"><span>met artikelen</span></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-lbl" style={{ color: 'var(--warning)' }}><IconAlertTriangle size={13} />Onder minimum</div>
          <div className="st-stat-val">{stats.onderMin}</div>
          <div className="st-stat-foot"><span>bijbestellen of inplannen</span></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-lbl"><IconPackage size={13} />Zonder recept</div>
          <div className="st-stat-val">{stats.zonderRecept}</div>
          <div className="st-stat-foot"><span>grondstof nog koppelen</span></div>
        </div>
      </div>

      <div className="st-toolbar">
        <div className="st-search">
          <IconPlus size={14} style={{ opacity: 0.4 }} />
          <input placeholder="Zoek artikelnr, naam, klant of tekening…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="kbd">⌘K</span>
        </div>
        <FilterChip
          label="Klant" value={klant}
          options={[['', 'Alle klanten'], ...customers.map(c => [c, c] as [string, string])]}
          onChange={setKlant}
        />
        <FilterChip
          label="Bewerking" value={bewerking}
          options={[['', 'Alle'], ...KNOWN_OPERATIONS.map(o => [o.id, o.name] as [string, string])]}
          onChange={setBewerking}
        />
        <FilterChip
          label="Status" value={status}
          options={[['', 'Alle'], ['ok', 'Op voorraad'], ['laag', 'Laag'], ['uit', 'Uit'], ['vol', 'Vol']]}
          onChange={setStatus}
        />
        <div style={{ flex: 1 }} />
        <button className="st-btn ghost sm">Meer filters</button>
      </div>

      <div className="st-table-wrap">
        <div className="st-tbl-scroll">
          <table className="st-tbl">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <span className="st-ck" data-on={allSelected} onClick={toggleAll} />
                </th>
                <SortTh k="id"       sort={sort} onSort={toggleSort}>Artikel</SortTh>
                <SortTh k="klant"    sort={sort} onSort={toggleSort}>Klant</SortTh>
                <th>Bewerking</th>
                <th>Grondstof</th>
                <SortTh k="voorraad" sort={sort} onSort={toggleSort} align="right">Voorraad</SortTh>
                <th style={{ minWidth: 140 }}>Niveau</th>
                <SortTh k="locatie"  sort={sort} onSort={toggleSort}>Locatie</SortTh>
                <th>Status</th>
                <SortTh k="totaalPrijs"        sort={sort} onSort={toggleSort} align="right">Totaal prijs</SortTh>
                <SortTh k="bewerkingKosten"    sort={sort} onSort={toggleSort} align="right">Bewerkingskosten</SortTh>
                <SortTh k="materiaalKosten"    sort={sort} onSort={toggleSort} align="right">Materiaalkosten</SortTh>
                <SortTh k="uitbestedingKosten" sort={sort} onSort={toggleSort} align="right">Uitbestedingskosten</SortTh>
                <SortTh k="marge"              sort={sort} onSort={toggleSort} align="right">Marge</SortTh>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const st  = statusForArt(it)
                const rec = formatRecipe(it)
                const pct = it.maxStock ? Math.min(100, Math.max(0, (it.currentStock / it.maxStock) * 100)) : (it.currentStock > 0 ? 100 : 0)
                const lvlCls = st.cls === 'ok' || st.cls === 'info' ? '' : st.cls
                const tot = totalsOf(it.id)
                return (
                  <tr key={it.id} data-selected={selected.has(it.id)} onClick={() => navigate(`/artikelen/${it.id}`)}>
                    <td className="col-checkbox" onClick={(e) => e.stopPropagation()}>
                      <span className="st-ck" data-on={selected.has(it.id)} onClick={() => toggleOne(it.id)} />
                    </td>
                    <td>
                      <div className="st-art-cell">
                        <div className="st-type-pic"><IconMinus size={16} /></div>
                        <div style={{ minWidth: 0 }}>
                          <div className="st-art-name">{it.naam}</div>
                          <div className="st-art-desc">{it.id}{it.tekening ? ` · ${it.tekening}${it.rev ? ` rev ${it.rev}` : ''}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td><div className="cell-strong" style={{ fontSize: 12.5 }}>{it.klant ?? '—'}</div></td>
                    <td>
                      <div className="op-chips">
                        {it.operations.map(op => (
                          <span key={op.id} className="op-chip">
                            {KNOWN_OPERATIONS.find(o => o.id === op.type)?.name ?? op.type}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {rec ? (
                        <>
                          <span className="cell-muted" style={{ fontSize: 12 }}>{rec.text}</span>
                          <span className="cell-mono cell-muted" style={{ marginLeft: 6, fontSize: 11 }}>· {rec.grade}</span>
                        </>
                      ) : <span className="cell-muted" style={{ fontSize: 12, fontStyle: 'italic' }}>geen recept</span>}
                    </td>
                    <td className="cell-num cell-strong">{it.currentStock}</td>
                    <td>
                      <div className={`st-lvl${lvlCls ? ` ${lvlCls}` : ''}`}>
                        <div className="st-lvl-bar"><i style={{ width: `${pct}%` }} /></div>
                        <span className="st-lvl-num">{it.currentStock}{it.maxStock ? `/${it.maxStock}` : ''}</span>
                      </div>
                    </td>
                    <td><span className="cell-muted">{it.locatie ?? '—'}</span></td>
                    <td><span className={`st-badge ${st.cls}`}><span className="dot" />{st.label}</span></td>
                    <td className="cell-num cell-strong">{eur(tot.sell)}</td>
                    <td className="cell-num">{eur(tot.machiningTotal)}</td>
                    <td className="cell-num">{eur(tot.materialTotal)}</td>
                    <td className="cell-num">{eur(tot.externalTotal)}</td>
                    <td className="cell-num">{tot.marginPct.toLocaleString('nl-NL')}%</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Menu position="bottom-end" withinPortal shadow="md">
                        <Menu.Target>
                          <button className="st-icon-btn" title="Acties"><IconDots size={15} /></button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconList size={14} />} onClick={() => navigate(`/artikelen/${it.id}`)}>
                            Openen
                          </Menu.Item>
                          {isAdmin && <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditItem(it)}>Bewerken</Menu.Item>}
                          {isAdmin && (
                            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => handleDelete(it)}>
                              Verwijderen
                            </Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={15} className="st-empty">Geen artikelen gevonden voor deze filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="st-tbl-foot">
          <span>{filtered.length} van {articles.length} artikelen</span>
          {selected.size > 0 && <span style={{ color: 'var(--text)' }}>· {selected.size} geselecteerd</span>}
          <div className="pager">
            <button className="st-btn ghost sm">‹</button>
            <span style={{ padding: '0 8px' }}>1 / 1</span>
            <button className="st-btn ghost sm">›</button>
          </div>
        </div>
      </div>

      <ArticleForm mode="edit" opened={!!editItem} item={editItem ?? undefined} allRows={articles} onClose={() => setEditItem(null)} />
    </>
  )
}
