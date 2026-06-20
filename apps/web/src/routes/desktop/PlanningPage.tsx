import React, { useState, useCallback } from 'react'
import { IconChevronLeft, IconChevronRight, IconCalendar } from '@tabler/icons-react'
import { projectsApi } from '../../api/projects'
import { articlesApi } from '../../api/articles'
import { machinesApi } from '../../api/machines'
import { relatiesApi } from '../../api/relaties'
import {
  getMaandag, weekDagen, toDateStr, formatDagHeader,
  berekenStapMin, berekenCelCapaciteit, minToUren,
  deadlineDagen, deadlineKleur, projectKleur,
  berekenOffertebelasting, EFFECTIEVE_MIN, MAX_MIN,
  type PlanningStapItem,
} from '../../utils/planningUtils'
import type { ProductieStap, ProductieOrder, Project } from '@stockmanager/shared'

// ── Data helpers ──────────────────────────────────────────────────────────────

function buildItems(projects: Project[]): PlanningStapItem[] {
  const articles = articlesApi.list()
  const result: PlanningStapItem[] = []
  for (const project of projects) {
    for (const order of project.productieOrders) {
      if (order.status === 'gereed') continue
      for (const stap of order.stappen) {
        if (stap.gereedOp) continue
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
  onDragStart: (item: PlanningStapItem) => void
  onMoveAll?: (item: PlanningStapItem) => void
  showMoveAll?: boolean
}

function StapCard({ item, isDragging, isGhost, onDragStart, onMoveAll, showMoveAll }: StapCardProps) {
  const kleur = projectKleur(item.project.id)
  const dagen = deadlineDagen(item.project, item.stap.geplandDatum ?? toDateStr(new Date()))
  const klasse = deadlineKleur(dagen)
  const relaties = relatiesApi.listSync()
  const relNaam = relaties.find(r => r.id === item.project.relatieId)?.naam

  return (
    <div
      className={`stap-card${isDragging ? ' dragging' : ''}${isGhost ? ' ghost' : ''}${item.isPlaceholder ? ' placeholder' : ''}`}
      style={{ borderLeftColor: kleur }}
      draggable={!isGhost}
      onDragStart={e => {
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
      </div>
      <div className="stap-card-order">
        {item.order.id} · {relNaam ?? item.project.naam}
      </div>
      {item.stap.geplandDatum && item.project.levertijdDatum && (
        <div className={`stap-card-deadline ${klasse}`}>
          {klasse === 'danger' ? '⚠ ' : ''}
          {dagen === null ? '' : dagen < 0 ? `${Math.abs(dagen)}d te laat` : dagen === 0 ? 'deadline vandaag' : `${dagen}d voor deadline`}
        </div>
      )}
      {showMoveAll && onMoveAll && (
        <button
          className="stap-card-group-btn"
          onClick={e => { e.stopPropagation(); onMoveAll(item) }}
          title="Verplaats alle stappen van dit order"
        >
          ↔ Verplaats alle stappen
        </button>
      )}
    </div>
  )
}

// ── CapaciteitsBar ─────────────────────────────────────────────────────────────

function CapaciteitsBar({ items }: { items: PlanningStapItem[] }) {
  const cap = berekenCelCapaciteit(items)
  if (items.length === 0) return null
  const pct = Math.min(cap.pctGebruikt, 1)
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
  ghostItems?: PlanningStapItem[]
  draggingItem: PlanningStapItem | null
  isVandaag: boolean
  onDrop: (stapId: string, orderId: string, projectId: string, datum: string, machine: string) => void
  onDragStart: (item: PlanningStapItem) => void
}

function DayCell({ datum, machine, items, ghostItems, draggingItem, isVandaag, onDrop, onDragStart }: DayCellProps) {
  const [over, setOver] = useState(false)

  return (
    <div
      className={`plan-cell${over ? ' drag-over' : ''}${isVandaag ? ' vandaag' : ''}`}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault()
        setOver(false)
        const stapId    = e.dataTransfer.getData('stapId')
        const orderId   = e.dataTransfer.getData('orderId')
        const projectId = e.dataTransfer.getData('projectId')
        if (stapId) onDrop(stapId, orderId, projectId, datum, machine)
      }}
    >
      {items.map(item => (
        <StapCard
          key={item.stap.id}
          item={item}
          isDragging={draggingItem?.stap.id === item.stap.id}
          onDragStart={onDragStart}
        />
      ))}
      {ghostItems?.map(item => (
        <StapCard
          key={`ghost-${item.stap.id}`}
          item={item}
          isDragging={false}
          isGhost
          onDragStart={() => {}}
        />
      ))}
      <CapaciteitsBar items={items} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PlanningPage() {
  const [maandag, setMaandag] = useState(getMaandag)
  const [tick, setTick]       = useState(0)
  const [draggingItem, setDraggingItem] = useState<PlanningStapItem | null>(null)
  const [showOffertes, setShowOffertes] = useState(false)
  const [, forceRender] = useState(0)

  const rerender = useCallback(() => { setTick(t => t + 1); forceRender(n => n + 1) }, [])

  const dagen   = weekDagen(maandag)
  const datums  = dagen.map(toDateStr)
  const machines = machinesApi.listSync().map(m => m.name)

  const projects = projectsApi.list()
  const articles = articlesApi.list()
  const items    = buildItems(projects)

  // Group items by machine+datum for the board
  function celItems(machine: string, datum: string): PlanningStapItem[] {
    return items.filter(i =>
      (i.stap.geplandMachine ?? i.stap.machine ?? '') === machine &&
      i.stap.geplandDatum === datum,
    )
  }

  // Unplanned = no date set
  const onbepaald = items.filter(i => !i.stap.geplandDatum)

  // Offerte ghost items (for overlay)
  function ghostItems(machine: string, _datum: string): PlanningStapItem[] {
    if (!showOffertes) return []
    // Show offerte load items as ghosts — spread starting from today on each machine
    return []  // simplified: offerte load shown in header bar, not as board ghosts
  }

  // Stats
  const thisWeekItems = items.filter(i => i.stap.geplandDatum && datums.includes(i.stap.geplandDatum))
  const geboektMin    = thisWeekItems.reduce((s, i) => s + i.duurMin, 0)
  const capMin        = machines.length * 5 * EFFECTIEVE_MIN
  const atRisk        = projects.filter(p =>
    p.levertijdDatum &&
    p.productieOrders.some(o => o.status !== 'gereed' && o.stappen.some(s => !s.gereedOp)),
  ).length

  const offerteItems = berekenOffertebelasting(projects, articles)
  const offerteTotaalMin = offerteItems.reduce((s, i) => s + i.totalMin, 0)

  function handleDrop(stapId: string, orderId: string, projectId: string, datum: string, machine: string) {
    projectsApi.planStap(projectId, orderId, stapId, datum, machine)
    rerender()
  }

  function handleMoveAll(item: PlanningStapItem) {
    if (!item.stap.geplandDatum) return
    const { order, project } = item
    const targetDatum = item.stap.geplandDatum
    const targetMachine = item.stap.geplandMachine ?? item.stap.machine ?? machines[0] ?? ''
    order.stappen
      .filter(s => !s.gereedOp)
      .forEach((s, i) => {
        // Spread subsequent stappen one day forward if possible
        const d = new Date(targetDatum)
        d.setDate(d.getDate() + i)
        // Skip weekends
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
        projectsApi.planStap(project.id, order.id, s.id, toDateStr(d), targetMachine)
      })
    rerender()
  }

  void tick // consumed to force re-render

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
          <IconCalendar size={14} />Vandaag
        </button>
        <button className="st-btn ghost xs" onClick={() => setMaandag(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}>
          <IconChevronRight size={14} />
        </button>

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
            <span className="plan-stat-val">{onbepaald.length}</span>
            <span className="plan-stat-lbl">Ongepland</span>
          </div>
        </div>
      </div>

      {/* Offerte belasting bar */}
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

      {/* Offerte detail */}
      {showOffertes && offerteItems.length > 0 && (
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 10,
        }}>
          {offerteItems.map(({ project, totalMin, aantalRegels }) => (
            <div key={project.id} style={{
              background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 10px', fontSize: 12,
              borderLeft: `3px solid ${projectKleur(project.id)}`,
            }}>
              <div style={{ fontWeight: 600 }}>{project.naam}</div>
              <div style={{ color: 'var(--text-3)' }}>{aantalRegels} regel{aantalRegels > 1 ? 's' : ''} · {minToUren(totalMin)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Body: backlog + board */}
      <div className="plan-body">
        {/* Backlog sidebar */}
        <div className="plan-backlog">
          <div className="plan-backlog-hd">Te plannen ({onbepaald.length})</div>
          <div className="plan-backlog-inner">
            {onbepaald.length === 0 && (
              <div className="plan-backlog-empty">Alle stappen ingepland</div>
            )}
            {onbepaald.map(item => (
              <StapCard
                key={item.stap.id}
                item={item}
                isDragging={draggingItem?.stap.id === item.stap.id}
                onDragStart={setDraggingItem}
                showMoveAll={false}
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
              return (
                <div key={toDateStr(d)} className={`plan-col-hd${isVandaag ? ' vandaag' : ''}`}>
                  {kort} {lang}
                </div>
              )
            })}

            {/* Machine rows */}
            {machines.map(machine => (
              <React.Fragment key={machine}>
                <div className="plan-mach-lbl">{machine}</div>
                {datums.map(datum => (
                  <DayCell
                    key={`${machine}-${datum}`}
                    datum={datum}
                    machine={machine}
                    items={celItems(machine, datum)}
                    ghostItems={ghostItems(machine, datum)}
                    draggingItem={draggingItem}
                    isVandaag={datum === toDateStr(new Date())}
                    onDrop={handleDrop}
                    onDragStart={setDraggingItem}
                  />
                ))}
              </React.Fragment>
            ))}

            {/* Drop zone: unassigned machine (for stappen without machine) */}
            <div className="plan-mach-lbl" style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 11 }}>Geen machine</div>
            {datums.map(datum => (
              <DayCell
                key={`none-${datum}`}
                datum={datum}
                machine=""
                items={celItems('', datum)}
                ghostItems={[]}
                draggingItem={draggingItem}
                isVandaag={datum === toDateStr(new Date())}
                onDrop={handleDrop}
                onDragStart={setDraggingItem}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
