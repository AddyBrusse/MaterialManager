import { useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocalStorage } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { projectsApi, initProjects } from '../../api/projects'
import { articlesApi, initArticles } from '../../api/articles'
import { machinesApi, initMachines } from '../../api/machines'
import { initRelaties } from '../../api/relaties'
import { buildStapItems } from '../../utils/planningSharedUtils'
import { toDateStr } from '../../utils/planningUtils'
import {
  type QueueJob, type QueueZoom, type CascadeImpact,
  buildQueueJobs, isBacklogJob, sortByQueuePosition, computeInsertPosition,
  deriveShopSchedule, computeVerplichtKlaar, buildConnectors, computeQueueKpis,
  hasDownstreamDependent, computeCascadeImpact, computeSuggestOptions, computeRelockedDates,
  EFFECTIEVE_MIN, type SuggestOptionResult,
} from '../../utils/planningQueueUtils'
import { QueueToolbar } from '../../components/planning-queue/QueueToolbar'
import { QueueKpiStrip } from '../../components/planning-queue/QueueKpiStrip'
import { QueueBacklog } from '../../components/planning-queue/QueueBacklog'
import { QueuePanel } from '../../components/planning-queue/QueuePanel'
import { QueueTimeline } from '../../components/planning-queue/QueueTimeline'
import { QueueDetails } from '../../components/planning-queue/QueueDetails'
import { SuggestScheduleModal } from '../../components/planning-queue/SuggestScheduleModal'
import { CascadeConfirmModal } from '../../components/planning-queue/CascadeConfirmModal'

interface PendingCascade {
  machineName: string
  proposedOrder: QueueJob[]
  impact: CascadeImpact
  movedJobLabel: string
  commit: () => void
}

export function PlanningQueuePage() {
  const navigate = useNavigate()
  const isPopout = useLocation().pathname.startsWith('/pop')

  const [rev, setRev] = useState(0)
  const bump = () => setRev(r => r + 1)

  useEffect(() => {
    Promise.all([initProjects(), initArticles(), initMachines(), initRelaties()]).then(bump)
  }, [])

  const [zoom, setZoom] = useLocalStorage<QueueZoom>({ key: 'sm_wq_zoom', defaultValue: 'week' })
  const [showKpi, setShowKpi] = useLocalStorage<boolean>({ key: 'sm_wq_kpi', defaultValue: false })
  const [showConnections, setShowConnections] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [selectedMachineName, setSelectedMachineName] = useState('')
  const [selectedJob, setSelectedJob] = useState<QueueJob | null>(null)
  const [draggingJob, setDraggingJob] = useState<QueueJob | null>(null)
  const [dragOverBacklog, setDragOverBacklog] = useState(false)
  const [pendingCascade, setPendingCascade] = useState<PendingCascade | null>(null)

  const windowStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const projects = projectsApi.list()
  const articles = articlesApi.list()
  const machines = machinesApi.listSync()

  useEffect(() => {
    if (!selectedMachineName && machines.length > 0) setSelectedMachineName(machines[0].name)
  }, [machines, selectedMachineName])

  const allItems = useMemo(() => buildStapItems(projects, articles), [projects, articles, rev])
  const allJobs = useMemo(() => buildQueueJobs(allItems, articles), [allItems])
  const backlog = useMemo(
    () => allJobs.filter(isBacklogJob).sort((a, b) => (a.deadline ?? '9999-99-99').localeCompare(b.deadline ?? '9999-99-99')),
    [allJobs],
  )

  // Single source of truth for "what order is each machine's queue in" —
  // built fresh from real queuePosition every render, then handed to the
  // whole-shop scheduler exactly once so every view (Wachtrij list,
  // Tijdlijn, KPIs, cascade/suggest calculations) agrees on the same result.
  const machineQueues = useMemo(() => {
    const map = new Map<string, QueueJob[]>()
    for (const m of machines) {
      const jobsForM = allJobs.filter(j => !isBacklogJob(j) && j.machineNaam === m.name)
      map.set(m.name, sortByQueuePosition(jobsForM))
    }
    return map
  }, [machines, allJobs])

  // honorLockedDates: true — the live board shows each job's committed
  // geplandDatum, not a fresh "if we started today" re-simulation, so nodes
  // stop drifting forward every time the page is reloaded on a later day.
  const schedule = useMemo(
    () => deriveShopSchedule(machineQueues, machines, windowStart, { honorLockedDates: true }),
    [machineQueues, machines, windowStart],
  )
  const verplichtKlaar = useMemo(() => computeVerplichtKlaar(allJobs, windowStart), [allJobs, windowStart])
  const connectors = useMemo(() => buildConnectors(allJobs), [allJobs])
  const kpis = useMemo(
    () => computeQueueKpis(allJobs, backlog, machines, schedule, verplichtKlaar, windowStart),
    [allJobs, backlog, machines, schedule, verplichtKlaar, windowStart],
  )

  const selectedMachine = machines.find(m => m.name === selectedMachineName)
  const selectedQueueJobs = machineQueues.get(selectedMachineName) ?? []

  const timelineRows = useMemo(() => machines.map(m => {
    const jobs = machineQueues.get(m.name) ?? []
    const totalMin = jobs.filter(j => !j.gereed).reduce((s, j) => s + j.duurMin, 0)
    return { machine: m, jobs, bezettingPct: Math.round((totalMin / (EFFECTIEVE_MIN * 5)) * 100) }
  }), [machines, machineQueues])

  // v2 restyle — the vertical machine-tab switcher shows every machine's
  // bezetting at once, not just the selected one.
  const bezettingByMachine = useMemo(
    () => new Map(timelineRows.map(r => [r.machine.name, r.bezettingPct])),
    [timelineRows],
  )

  function flash(msg: string) {
    notifications.show({ message: msg })
  }

  function handleDragStart(e: DragEvent, job: QueueJob) {
    setDraggingJob(job)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', job.id) } catch { /* unsupported in some browsers */ }
  }
  function handleDragEnd() {
    setDraggingJob(null)
    setDragOverBacklog(false)
  }

  // Writes the freshly-relocked geplandDatum for every job whose committed
  // date actually changed as a result of this move — the moved job itself
  // plus any queue-mate/cross-machine dependent that genuinely cascaded.
  // Jobs whose relocked date matches what's already stored are left alone
  // (no-op), so unrelated machines' committed dates never get touched.
  function applyRelockedDates(relocked: Map<string, string>, queues: Map<string, QueueJob[]>) {
    for (const jobs of queues.values()) {
      for (const j of jobs) {
        const newDate = relocked.get(j.id)
        if (newDate && newDate !== j.item.stap.geplandDatum) {
          projectsApi.planStap(j.item.project.id, j.item.order.id, j.item.stap.id, newDate, j.machineNaam)
        }
      }
    }
  }

  function commitAssign(job: QueueJob, machineNaam: string, newPos: number, proposedOrder: QueueJob[]) {
    const { project, order, stap } = job.item
    const newQueues = new Map([...machineQueues, [machineNaam, proposedOrder]])
    const relocked = computeRelockedDates(newQueues, new Set([machineNaam]), machines, windowStart)
    const jobDate = relocked.get(job.id) ?? stap.geplandDatum ?? toDateStr(new Date())
    projectsApi.planStap(project.id, order.id, stap.id, jobDate, machineNaam, newPos)
    applyRelockedDates(relocked, newQueues)
    bump()
    flash(`${job.artikel} → ${machineNaam}`)
  }

  function assignToMachine(job: QueueJob, machineNaam: string, beforeId: string | null) {
    const wasBacklog = isBacklogJob(job)
    const sameMachine = !wasBacklog && job.machineNaam === machineNaam
    const targetExisting = (machineQueues.get(machineNaam) ?? []).filter(j => j.id !== job.id)
    const newPos = computeInsertPosition(targetExisting, beforeId)

    const idx = targetExisting.findIndex(j => j.id === beforeId)
    const proposedOrder = [...targetExisting]
    const insertAt = beforeId == null ? proposedOrder.length : (idx === -1 ? proposedOrder.length : idx)
    proposedOrder.splice(insertAt, 0, job)

    // Cascade check only applies to a same-machine reorder of a job that has
    // a queued successor step on a different machine — moving a backlog job
    // in, or moving a job that has no downstream dependent, never cascades.
    const downstream = sameMachine ? hasDownstreamDependent(job, allJobs) : null
    if (downstream) {
      const impact = computeCascadeImpact(machineNaam, proposedOrder, machineQueues, machines, windowStart)
      if (impact) {
        setPendingCascade({
          machineName: machineNaam,
          proposedOrder,
          impact,
          movedJobLabel: `${job.orderId} (${job.naam})`,
          commit: () => commitAssign(job, machineNaam, newPos, proposedOrder),
        })
        return
      }
    }
    commitAssign(job, machineNaam, newPos, proposedOrder)
  }

  function handleUnplan(job: QueueJob) {
    const { project, order, stap } = job.item
    projectsApi.planStap(project.id, order.id, stap.id, null, null, null)
    if (selectedJob?.id === job.id) setSelectedJob(null)
    bump()
    flash(`${job.artikel} terug naar backlog`)
  }

  function handleSetHold(job: QueueJob, notBefore: string | null) {
    const { project, order, stap } = job.item
    projectsApi.setHold(project.id, order.id, stap.id, notBefore)
    bump()
    flash(notBefore ? `Hold ingesteld: niet eerder dan ${notBefore}` : 'Hold verwijderd')
  }

  function handleDropOnBacklog(e: DragEvent) {
    e.preventDefault()
    setDragOverBacklog(false)
    if (draggingJob && !isBacklogJob(draggingJob)) handleUnplan(draggingJob)
    setDraggingJob(null)
  }

  function handleDropOnQueueCard(e: DragEvent, beforeId: string) {
    e.preventDefault()
    if (draggingJob && draggingJob.id !== beforeId) assignToMachine(draggingJob, selectedMachineName, beforeId)
    setDraggingJob(null)
  }

  function handleDropAtEndOfQueue(e: DragEvent) {
    e.preventDefault()
    if (draggingJob) assignToMachine(draggingJob, selectedMachineName, null)
    setDraggingJob(null)
  }

  function handleOpenProject(job: QueueJob) {
    navigate(`/projecten/${job.item.project.id}`)
  }

  function confirmCascade() {
    if (!pendingCascade) return
    pendingCascade.commit()
    setPendingCascade(null)
    flash('Wijziging bevestigd — planning bijgewerkt')
  }
  function cancelCascade() {
    setPendingCascade(null)
  }

  const suggestOptions = useMemo(
    () => (suggestOpen ? computeSuggestOptions(allJobs, backlog, machineQueues, machines, windowStart) : []),
    [suggestOpen, allJobs, backlog, machineQueues, machines, windowStart],
  )

  function applySuggestOption(option: SuggestOptionResult) {
    // The optimizer reorders every machine's queue, so every machine counts
    // as "changed" — each job gets a freshly-derived committed geplandDatum
    // rather than reusing whatever date it happened to have before.
    const relocked = computeRelockedDates(option.queues, new Set(option.queues.keys()), machines, windowStart)
    let changes = 0
    for (const [machineName, jobs] of option.queues) {
      jobs.forEach((job, i) => {
        const newPos = (i + 1) * 1000
        const newDate = relocked.get(job.id) ?? job.item.stap.geplandDatum ?? toDateStr(new Date())
        if (job.queuePosition !== newPos || newDate !== job.item.stap.geplandDatum) {
          const { project, order, stap } = job.item
          projectsApi.planStap(project.id, order.id, stap.id, newDate, machineName, newPos)
          changes++
        }
      })
    }
    bump()
    flash(`Toegepast: ${option.title} (${changes} stap${changes === 1 ? '' : 'pen'} herschikt)`)
  }

  return (
    <div className="wq pg-root">
      <QueueToolbar
        zoom={zoom} onZoom={setZoom}
        showKpi={showKpi} onToggleKpi={() => setShowKpi(v => !v)}
        onSuggest={() => setSuggestOpen(true)}
        onClose={isPopout ? () => window.close() : undefined}
      />
      {showKpi && <QueueKpiStrip kpis={kpis} />}

      <div className="wq-body">
        <QueueBacklog
          jobs={backlog}
          machines={machines}
          schedule={schedule}
          verplichtKlaar={verplichtKlaar}
          windowStart={windowStart}
          selectedId={selectedJob?.id ?? null}
          onSelect={setSelectedJob}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          isDropTarget={dragOverBacklog}
          onDragOver={e => { e.preventDefault(); if (draggingJob && !isBacklogJob(draggingJob)) setDragOverBacklog(true) }}
          onDragLeave={() => setDragOverBacklog(false)}
          onDrop={handleDropOnBacklog}
        />

        <QueuePanel
          machines={machines}
          selectedMachine={selectedMachine}
          onSelectMachine={setSelectedMachineName}
          bezettingByMachine={bezettingByMachine}
          jobs={selectedQueueJobs}
          schedule={schedule}
          verplichtKlaar={verplichtKlaar}
          windowStart={windowStart}
          selectedId={selectedJob?.id ?? null}
          onSelect={setSelectedJob}
          draggingId={draggingJob?.id ?? null}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnCard={handleDropOnQueueCard}
          onDropAtEnd={handleDropAtEndOfQueue}
        />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <QueueTimeline
            rows={timelineRows}
            schedule={schedule}
            verplichtKlaar={verplichtKlaar}
            allJobs={allJobs}
            zoom={zoom}
            windowStart={windowStart}
            connectors={connectors}
            showConnections={showConnections}
            onToggleConnections={() => setShowConnections(v => !v)}
            selectedId={selectedJob?.id ?? null}
            onSelectJob={setSelectedJob}
            onDeselect={() => setSelectedJob(null)}
          />
          <QueueDetails
            job={selectedJob}
            schedule={schedule}
            verplichtKlaar={verplichtKlaar}
            allJobs={allJobs}
            windowStart={windowStart}
            machines={machines}
            articles={articles}
            onClose={() => setSelectedJob(null)}
            onUnplan={handleUnplan}
            onOpenProject={handleOpenProject}
            onSetHold={handleSetHold}
          />
        </div>
      </div>

      <SuggestScheduleModal
        opened={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        options={suggestOptions}
        baseline={kpis}
        onApply={applySuggestOption}
      />
      <CascadeConfirmModal
        opened={!!pendingCascade}
        impact={pendingCascade?.impact ?? null}
        movedJobLabel={pendingCascade?.movedJobLabel ?? ''}
        onConfirm={confirmCascade}
        onCancel={cancelCascade}
      />
    </div>
  )
}
