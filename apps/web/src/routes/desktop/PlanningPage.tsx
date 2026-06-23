import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  IconChevronLeft, IconChevronRight, IconCalendar,
  IconX, IconCheck, IconArrowBackUp, IconAlertTriangle,
  IconEye, IconEyeOff, IconSortAscending,
} from '@tabler/icons-react'
import { projectsApi, initProjects } from '../../api/projects'
import { articlesApi, initArticles } from '../../api/articles'
import { machinesApi, initMachines } from '../../api/machines'
import { relatiesApi, initRelaties } from '../../api/relaties'
import { useUserStore } from '../../stores/user'
import {
  getMaandag, weekDagen, toDateStr, formatDagHeader,
  berekenStapMin, berekenCelCapaciteit, minToUren,
  deadlineDagen, deadlineKleur, projectKleur,
  berekenOffertebelasting, EFFECTIEVE_MIN, MAX_MIN,
  berekenMachineWeekCap, vindAchterstanden,
  heeftVolgordeWaarschuwing, projectenOpDatum,
  type PlanningStapItem,
} from '../../utils/planningUtils'
import type { Project } from '@stockmanager/shared'

// ── Data helpers ──────────────────────────────────────────────────────────────

function buildItems(projects: Project[], includeCompleted = false): PlanningStapItem[] {
  const articles = articlesApi.list()
  const result: PlanningStapItem[] = []
  for (const project of projects) {
    for (const order of project.productieOrders) {
      if (order.status === 'gereed') continue
      for (const stap of order.stappen) {
        if (stap.gereedOp && !includeCompleted) continue
        const { min, isPlaceholder } = berekenStapMin(stap, order, articles)
        result.push({ stap, order, project, duurMin: min, isPlaceholder })
      }
    }
  }
  return result
}

// ── StapCard ──────────────────────────────────────────────────────────────────

interface StapCardProps {
  item: PlanningStapItem
  isDragging: boolean
  isGhost?: boolean
  isCompleted?: boolean
  isBacklog?: boolean
  editingDeadlineProjectId?: string | null
  hasVolgordeWaarschuwing?: boolean
  onDragStart: (item: PlanningStapItem) => void
  onUnplan?: (item: PlanningStapItem) => void
  onUnplanAll?: (item: PlanningStapItem) => void
  onMoveAll?: (item: PlanningStapItem) => void
  onCheckOff?: (item: PlanningStapItem) => void
  onPlanFromDate?: (item: PlanningStapItem, date: string) => void
  onStartEditDeadline?: (projectId: string | null) => void
  onEditDeadline?: (item: PlanningStapItem, date: string) => void
}

function StapCard({
  item, isDragging, isGhost, isCompleted, isBacklog,
  editingDeadlineProjectId, hasVolgordeWaarschuwing,
  onDragStart, onUnplan, onUnplanAll, onMoveAll, onCheckOff,
  onPlanFromDate, onStartEditDeadline, onEditDeadline,
}: StapCardProps) {
  const [planDate, setPlanDate] = useState('')
  const kleur   = projectKleur(item.project.id)
  const refDate = item.stap.geplandDatum ?? toDateStr(new Date())
  const dagen   = deadlineDagen(item.project, refDate)
  const klasse  = deadlineKleur(dagen)
  const relNaam = relatiesApi.listSync().find(r => r.id === item.project.relatieId)?.naam
  const isEditingDl = editingDeadlineProjectId === item.project.id

  const classes = ['stap-card', isDragging && 'dragging', isGhost && 'ghost',
    item.isPlaceholder && 'placeholder', isCompleted && 'completed'].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      style={{ borderLeftColor: kleur }}
      draggable={!isGhost && !isCompleted}
      onDragStart={e => {
        if (isGhost || isCompleted) return
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('stapId', item.stap.id)
        e.dataTransfer.setData('orderId', item.order.id)
        e.dataTransfer.setData('projectId', item.project.id)
        onDragStart(item)
      }}
    >
      <div className="stap-card-top">
        <span className="stap-card-naam">{item.stap.naam}</span>
        <span className={`stap-card-dur${item.isPlaceholder ? ' placeholder' : ''}`}>
          {item.isPlaceholder ? '~' : ''}{minToUren(item.duurMin)}
        </span>
        {!isGhost && (
          <div className="stap-card-actions">
            {onCheckOff && !isCompleted && (
              <button className="stap-card-btn check" title="Gereed melden"
                onClick={e => { e.stopPropagation(); onCheckOff(item) }}>
                <IconCheck size={10} />
              </button>
            )}
            {onUnplan && (
              <button className="stap-card-btn remove" title="Terug naar backlog"
                onClick={e => { e.stopPropagation(); onUnplan(item) }}>
                <IconX size={10} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="stap-card-order">{item.order.id} · {relNaam ?? item.project.naam}</div>

      {hasVolgordeWaarschuwing && (
        <div className="stap-card-volgorde-warn">
          <IconAlertTriangle size={9} /> Voorganger nog niet eerder ingepland
        </div>
      )}

      {item.project.levertijdDatum && (
        isEditingDl ? (
          <input
            type="date"
            className="stap-card-deadline-input"
            defaultValue={item.project.levertijdDatum}
            autoFocus
            onClick={e => e.stopPropagation()}
            onBlur={e => {
              if (e.target.value) onEditDeadline?.(item, e.target.value)
              onStartEditDeadline?.(null)
            }}
          />
        ) : (
          <div
            className={`stap-card-deadline ${klasse}`}
            onClick={e => { e.stopPropagation(); onStartEditDeadline?.(item.project.id) }}
            title="Klik om levertijdatum te wijzigen"
            style={{ cursor: onStartEditDeadline ? 'pointer' : undefined }}
          >
            {klasse === 'danger' ? '⚠ ' : ''}
            {dagen === null ? '' : dagen < 0
              ? `${Math.abs(dagen)}d te laat`
              : dagen === 0 ? 'deadline vandaag' : `${dagen}d voor deadline`}
            {onStartEditDeadline && <span className="stap-card-deadline-edit"> ✎</span>}
          </div>
        )
      )}

      {!isBacklog && !isGhost && (onUnplanAll || onMoveAll) && (
        <div className="stap-card-links">
          {onUnplanAll && (
            <button className="stap-card-link-btn"
              onClick={e => { e.stopPropagation(); onUnplanAll(item) }}>
              ↩ Alles ongepland
            </button>
          )}
          {onMoveAll && (
            <button className="stap-card-link-btn"
              onClick={e => { e.stopPropagation(); onMoveAll(item) }}>
              ↕ Alles verplaatsen
            </button>
          )}
        </div>
      )}

      {isBacklog && onPlanFromDate && !isGhost && (
        <input
          type="date"
          className="stap-card-plan-date"
          min={toDateStr(new Date())}
          value={planDate}
          onChange={e => {
            setPlanDate(e.target.value)
            if (e.target.value) { onPlanFromDate(item, e.target.value); setPlanDate('') }
          }}
          onClick={e => e.stopPropagation()}
          title="Plannen vanaf datum"
        />
      )}
    </div>
  )
}

// ── CapaciteitsBar ─────────────────────────────────────────────────────────────

function CapaciteitsBar({ items }: { items: PlanningStapItem[] }) {
  const cap = berekenCelCapaciteit(items)
  if (items.length === 0) return null
  const pct    = Math.min(cap.pctGebruikt, 1)
  const klasse = cap.geboektMin > MAX_MIN ? 'over' : cap.geboektMin > EFFECTIEVE_MIN ? 'warn' : 'ok'
  return (
    <div className="plan-cap-bar-wrap">
      <div className="plan-cap-bar">
        <div className={`plan-cap-fill ${klasse}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className={`plan-cap-lbl${klasse === 'over' ? ' over' : ''}`}>
        {minToUren(cap.geboektMin)} / {minToUren(EFFECTIEVE_MIN)} eff
        {cap.overboekt ? ` ⚠ +${minToUren(cap.geboektMin - EFFECTIEVE_MIN)}` : ''}
      </span>
    </div>
  )
}

// ── DayCell ────────────────────────────────────────────────────────────────────

interface DayCellProps {
  datum: string
  machine: string
  items: PlanningStapItem[]
  draggingItem: PlanningStapItem | null
  isVandaag: boolean
  editingDeadlineProjectId: string | null
  onDrop: (stapId: string, orderId: string, projectId: string, datum: string, machine: string) => void
  onDragStart: (item: PlanningStapItem) => void
  onUnplan: (item: PlanningStapItem) => void
  onUnplanAll: (item: PlanningStapItem) => void
  onMoveAll: (item: PlanningStapItem) => void
  onCheckOff: (item: PlanningStapItem) => void
  onStartEditDeadline: (projectId: string | null) => void
  onEditDeadline: (item: PlanningStapItem, date: string) => void
}

function DayCell({
  datum, machine, items, draggingItem, isVandaag, editingDeadlineProjectId,
  onDrop, onDragStart, onUnplan, onUnplanAll, onMoveAll, onCheckOff,
  onStartEditDeadline, onEditDeadline,
}: DayCellProps) {
  const [over, setOver] = useState(false)
  const activeItems    = items.filter(i => !i.stap.gereedOp)
  const completedItems = items.filter(i =>  i.stap.gereedOp)

  return (
    <div
      className={`plan-cell${over ? ' drag-over' : ''}${isVandaag ? ' vandaag' : ''}`}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault(); setOver(false)
        const stapId    = e.dataTransfer.getData('stapId')
        const orderId   = e.dataTransfer.getData('orderId')
        const projectId = e.dataTransfer.getData('projectId')
        if (stapId) onDrop(stapId, orderId, projectId, datum, machine)
      }}
    >
      {activeItems.map(item => (
        <StapCard key={item.stap.id} item={item}
          isDragging={draggingItem?.stap.id === item.stap.id}
          editingDeadlineProjectId={editingDeadlineProjectId}
          hasVolgordeWaarschuwing={heeftVolgordeWaarschuwing(item)}
          onDragStart={onDragStart} onUnplan={onUnplan} onUnplanAll={onUnplanAll}
          onMoveAll={onMoveAll} onCheckOff={onCheckOff}
          onStartEditDeadline={onStartEditDeadline} onEditDeadline={onEditDeadline}
        />
      ))}
      {completedItems.map(item => (
        <StapCard key={`done-${item.stap.id}`} item={item}
          isDragging={false} isCompleted
          onDragStart={() => {}}
        />
      ))}
      <CapaciteitsBar items={activeItems} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PlanningPage() {
  const [maandag, setMaandag]   = useState(getMaandag)
  const [tick, setTick]         = useState(0)
  const [draggingItem, setDraggingItem]               = useState<PlanningStapItem | null>(null)
  const [showOffertes, setShowOffertes]               = useState(false)
  const [showCompleted, setShowCompleted]             = useState(false)
  const [backlogSort, setBacklogSort]                 = useState<'default' | 'deadline'>('deadline')
  const [backlogFilter, setBacklogFilter]             = useState('')
  const [editingDeadlineProjectId, setEditingDeadlineProjectId] = useState<string | null>(null)
  const [undoLabel, setUndoLabel]                     = useState<string | null>(null)
  const [, forceRender]                               = useState(0)
  const undoFnRef = useRef<(() => void) | null>(null)
  const userName  = useUserStore(state => state.user?.name ?? 'Onbekend')

  const rerender = useCallback(() => { setTick(t => t + 1); forceRender(n => n + 1) }, [])

  // projects/articles/machines/relaties are read synchronously from each
  // module's in-memory cache, which starts out seeded from localStorage (or
  // hardcoded mock defaults) — re-fetch the real data and force a re-render
  // once it's in, instead of getting stuck showing stale/seeded data forever.
  useEffect(() => {
    Promise.all([initProjects(), initArticles(), initMachines(), initRelaties()]).then(rerender)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function saveUndo(label: string, fn: () => void) {
    undoFnRef.current = fn
    setUndoLabel(label)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && undoFnRef.current) {
        e.preventDefault()
        undoFnRef.current()
        undoFnRef.current = null
        setUndoLabel(null)
        rerender()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [rerender])

  const dagen    = weekDagen(maandag)
  const datums   = dagen.map(toDateStr)
  const machines = machinesApi.listSync().map(m => m.name)
  const projects = projectsApi.list()
  const articles = articlesApi.list()
  const items    = buildItems(projects, showCompleted)

  function celItems(machine: string, datum: string) {
    return items.filter(i =>
      (i.stap.geplandMachine ?? i.stap.machine ?? '') === machine &&
      i.stap.geplandDatum === datum,
    )
  }

  // Backlog — unplanned non-done items
  const allOnbepaald = buildItems(projects, false).filter(i => !i.stap.geplandDatum)
  const filtered     = backlogFilter
    ? allOnbepaald.filter(i => i.project.id === backlogFilter)
    : allOnbepaald
  const onbepaald    = backlogSort === 'deadline'
    ? [...filtered].sort((a, b) => {
        const dA = deadlineDagen(a.project, toDateStr(new Date())) ?? 9999
        const dB = deadlineDagen(b.project, toDateStr(new Date())) ?? 9999
        return dA - dB
      })
    : filtered

  const achterstanden  = vindAchterstanden(buildItems(projects, false))
  const backlogProjects = [...new Map(allOnbepaald.map(i => [i.project.id, i.project])).values()]

  // Stats
  const capItems    = items.filter(i => !i.stap.gereedOp)
  const weekItems   = capItems.filter(i => i.stap.geplandDatum && datums.includes(i.stap.geplandDatum))
  const geboektMin  = weekItems.reduce((s, i) => s + i.duurMin, 0)
  const capMin      = machines.length * 5 * EFFECTIEVE_MIN
  const atRisk      = projects.filter(p =>
    p.levertijdDatum && p.productieOrders.some(o =>
      o.status !== 'gereed' && o.stappen.some(s => !s.gereedOp),
    ),
  ).length
  const offerteItems     = berekenOffertebelasting(projects, articles)
  const offerteTotaalMin = offerteItems.reduce((s, i) => s + i.totalMin, 0)

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleDrop(stapId: string, orderId: string, projectId: string, datum: string, machine: string) {
    const p   = projectsApi.get(projectId)
    const o   = p.productieOrders.find(x => x.id === orderId)
    const s   = o?.stappen.find(x => x.id === stapId)
    const prevDatum   = s?.geplandDatum   ?? null
    const prevMachine = s?.geplandMachine ?? null
    projectsApi.planStap(projectId, orderId, stapId, datum, machine)
    saveUndo(
      prevDatum ? 'Verplaatsing terugdraaien' : 'Terugzetten naar backlog',
      () => projectsApi.planStap(projectId, orderId, stapId, prevDatum, prevMachine),
    )
    rerender()
  }

  function handleUnplan(item: PlanningStapItem) {
    const prevDatum   = item.stap.geplandDatum   ?? null
    const prevMachine = item.stap.geplandMachine ?? null
    projectsApi.planStap(item.project.id, item.order.id, item.stap.id, null, null)
    saveUndo('Opnieuw inplannen',
      () => projectsApi.planStap(item.project.id, item.order.id, item.stap.id, prevDatum, prevMachine))
    rerender()
  }

  function handleUnplanAll(item: PlanningStapItem) {
    const prev = item.order.stappen
      .filter(s => !s.gereedOp)
      .map(s => ({ id: s.id, datum: s.geplandDatum ?? null, machine: s.geplandMachine ?? null }))
    projectsApi.unplanOrder(item.project.id, item.order.id)
    saveUndo('Inplanning herstellen', () => {
      for (const { id, datum, machine } of prev)
        projectsApi.planStap(item.project.id, item.order.id, id, datum, machine)
    })
    rerender()
  }

  function handleMoveAll(item: PlanningStapItem) {
    if (!item.stap.geplandDatum) return
    const targetMachine = item.stap.geplandMachine ?? item.stap.machine ?? machines[0] ?? ''
    item.order.stappen.filter(s => !s.gereedOp).forEach((s, i) => {
      const d = new Date(item.stap.geplandDatum!)
      d.setDate(d.getDate() + i)
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
      projectsApi.planStap(item.project.id, item.order.id, s.id, toDateStr(d), targetMachine)
    })
    rerender()
  }

  function handleMoveAllFromDate(item: PlanningStapItem, date: string) {
    const targetMachine = item.stap.machine ?? machines[0] ?? ''
    item.order.stappen.filter(s => !s.gereedOp).forEach((s, i) => {
      const d = new Date(date)
      d.setDate(d.getDate() + i)
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
      projectsApi.planStap(item.project.id, item.order.id, s.id, toDateStr(d), targetMachine)
    })
    rerender()
  }

  function handleCheckOff(item: PlanningStapItem) {
    projectsApi.checkOffStap(item.project.id, item.order.id, item.stap.id, userName)
    rerender()
  }

  function handleEditDeadline(item: PlanningStapItem, date: string) {
    projectsApi.update(item.project.id, { levertijdDatum: date })
    rerender()
  }

  void tick

  return (
    <div className="plan-page">
      {/* Header */}
      <div className="plan-header">
        <button className="st-btn ghost xs" onClick={() => setMaandag(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}>
          <IconChevronLeft size={14} />
        </button>
        <span className="plan-week-title">
          {dagen[0].toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} –{' '}
          {dagen[4].toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <button className="st-btn ghost xs" onClick={() => setMaandag(getMaandag())}>
          <IconCalendar size={14} /> Vandaag
        </button>
        <button className="st-btn ghost xs" onClick={() => setMaandag(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}>
          <IconChevronRight size={14} />
        </button>

        <div className="plan-header-tools">
          <button
            className={`st-btn ghost xs${showCompleted ? ' active' : ''}`}
            onClick={() => setShowCompleted(s => !s)}
            title={showCompleted ? 'Gereed verbergen' : 'Gereed tonen'}
          >
            {showCompleted ? <IconEyeOff size={14} /> : <IconEye size={14} />}
            {showCompleted ? 'Verberg gereed' : 'Toon gereed'}
          </button>
          {undoLabel && (
            <button className="plan-undo-btn" title="Ctrl+Z"
              onClick={() => { undoFnRef.current?.(); undoFnRef.current = null; setUndoLabel(null); rerender() }}>
              <IconArrowBackUp size={13} /> {undoLabel}
            </button>
          )}
        </div>

        <div className="plan-stats-strip">
          <div className="plan-stat">
            <span className="plan-stat-val">{minToUren(geboektMin)}</span>
            <span className="plan-stat-lbl">Ingepland</span>
          </div>
          <div className="plan-stat">
            <span className="plan-stat-val">{minToUren(capMin)}</span>
            <span className="plan-stat-lbl">Capaciteit</span>
          </div>
          <div className="plan-stat">
            <span className={`plan-stat-val${atRisk > 0 ? ' warn' : ''}`}>{atRisk}</span>
            <span className="plan-stat-lbl">At risk</span>
          </div>
          <div className="plan-stat">
            <span className="plan-stat-val">{allOnbepaald.length}</span>
            <span className="plan-stat-lbl">Ongepland</span>
          </div>
        </div>
      </div>

      {/* Overdue banner */}
      {achterstanden.length > 0 && (
        <div className="plan-achterstand-banner">
          <IconAlertTriangle size={14} />
          <strong>{achterstanden.length}</strong> stap{achterstanden.length !== 1 ? 'pen' : ''} uit vorige weken niet afgerond —
          sleep naar deze week of markeer gereed
        </div>
      )}

      {/* Offerte belasting */}
      {offerteItems.length > 0 && (
        <div className="plan-offerte-bar">
          <span style={{ color: 'var(--warning)', fontWeight: 700 }}>⚠</span>
          <span>
            <strong>{offerteItems.length}</strong> offerte{offerteItems.length > 1 ? 's' : ''} uitstaand —{' '}
            worst case <strong>{minToUren(offerteTotaalMin)}</strong> extra belasting als alles geaccepteerd wordt
          </span>
          <button className="plan-offerte-toggle" onClick={() => setShowOffertes(s => !s)}>
            {showOffertes ? 'Verberg' : 'Toon detail'}
          </button>
        </div>
      )}
      {showOffertes && offerteItems.length > 0 && (
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {offerteItems.map(({ project, totalMin, aantalRegels }) => (
            <div key={project.id} style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, borderLeft: `3px solid ${projectKleur(project.id)}` }}>
              <div style={{ fontWeight: 600 }}>{project.naam}</div>
              <div style={{ color: 'var(--text-3)' }}>{aantalRegels} regel{aantalRegels > 1 ? 's' : ''} · {minToUren(totalMin)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="plan-body">
        {/* Backlog */}
        <div className="plan-backlog">
          <div className="plan-backlog-hd">Te plannen ({allOnbepaald.length})</div>
          {(backlogProjects.length > 1) && (
            <div className="plan-backlog-controls">
              <select className="plan-backlog-filter" value={backlogFilter} onChange={e => setBacklogFilter(e.target.value)}>
                <option value="">Alle projecten</option>
                {backlogProjects.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
              </select>
              <button
                className={`plan-backlog-sort-btn${backlogSort === 'deadline' ? ' active' : ''}`}
                onClick={() => setBacklogSort(s => s === 'deadline' ? 'default' : 'deadline')}
                title="Sorteren op deadline"
              >
                <IconSortAscending size={12} />
              </button>
            </div>
          )}
          <div className="plan-backlog-inner">
            {onbepaald.length === 0 && (
              <div className="plan-backlog-empty">
                {backlogFilter ? 'Geen resultaten voor dit project' : 'Alle stappen ingepland'}
              </div>
            )}
            {onbepaald.map(item => (
              <StapCard key={item.stap.id} item={item}
                isDragging={draggingItem?.stap.id === item.stap.id}
                isBacklog
                editingDeadlineProjectId={editingDeadlineProjectId}
                hasVolgordeWaarschuwing={heeftVolgordeWaarschuwing(item)}
                onDragStart={setDraggingItem}
                onCheckOff={handleCheckOff}
                onPlanFromDate={handleMoveAllFromDate}
                onStartEditDeadline={setEditingDeadlineProjectId}
                onEditDeadline={handleEditDeadline}
              />
            ))}
          </div>
        </div>

        {/* Board */}
        <div className="plan-board-wrap" onDragEnd={() => setDraggingItem(null)}>
          <div className="plan-board">
            {/* Column headers */}
            <div className="plan-col-hd" />
            {dagen.map(d => {
              const { kort, lang, isVandaag } = formatDagHeader(d)
              const datStr = toDateStr(d)
              const dlProjects = projectenOpDatum(projects, datStr)
              return (
                <div key={datStr} className={`plan-col-hd${isVandaag ? ' vandaag' : ''}`}>
                  {kort} {lang}
                  {dlProjects.length > 0 && (
                    <div className="plan-col-deadlines">
                      {dlProjects.map(p => (
                        <span key={p.id} className="plan-col-deadline-dot"
                          style={{ background: projectKleur(p.id) }} title={`Deadline: ${p.naam}`} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Machine rows */}
            {machines.map(machine => {
              const cap    = berekenMachineWeekCap(capItems, machine, datums)
              const capPct = Math.round(cap.pctGebruikt * 100)
              return (
                <React.Fragment key={machine}>
                  <div className="plan-mach-lbl">
                    <span>{machine}</span>
                    <div className="plan-mach-cap">
                      <div className="plan-mach-cap-bar">
                        <div
                          className={`plan-mach-cap-fill ${cap.overboekt ? 'over' : capPct > 70 ? 'warn' : 'ok'}`}
                          style={{ width: `${Math.min(capPct, 100)}%` }}
                        />
                      </div>
                      <span className="plan-mach-cap-pct">{capPct}%</span>
                    </div>
                  </div>
                  {datums.map(datum => (
                    <DayCell key={`${machine}-${datum}`} datum={datum} machine={machine}
                      items={celItems(machine, datum)} draggingItem={draggingItem}
                      isVandaag={datum === toDateStr(new Date())}
                      editingDeadlineProjectId={editingDeadlineProjectId}
                      onDrop={handleDrop} onDragStart={setDraggingItem}
                      onUnplan={handleUnplan} onUnplanAll={handleUnplanAll} onMoveAll={handleMoveAll}
                      onCheckOff={handleCheckOff}
                      onStartEditDeadline={setEditingDeadlineProjectId} onEditDeadline={handleEditDeadline}
                    />
                  ))}
                </React.Fragment>
              )
            })}

            {/* No machine row */}
            <div className="plan-mach-lbl" style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 11 }}>
              <span>Geen machine</span>
            </div>
            {datums.map(datum => (
              <DayCell key={`none-${datum}`} datum={datum} machine=""
                items={celItems('', datum)} draggingItem={draggingItem}
                isVandaag={datum === toDateStr(new Date())}
                editingDeadlineProjectId={editingDeadlineProjectId}
                onDrop={handleDrop} onDragStart={setDraggingItem}
                onUnplan={handleUnplan} onUnplanAll={handleUnplanAll} onMoveAll={handleMoveAll}
                onCheckOff={handleCheckOff}
                onStartEditDeadline={setEditingDeadlineProjectId} onEditDeadline={handleEditDeadline}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
