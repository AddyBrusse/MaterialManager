import { useEffect, useRef } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useListState } from '@mantine/hooks'
import { IconGripVertical, IconBolt, IconAlertTriangle } from '@tabler/icons-react'
import { reservationsStore } from '../../api/reservations'
import { buildJobs, type ZaagJob } from '../../api/zaag-jobs'

// Active jobs only (open + in_progress) — done jobs drop off the planner.
function activeJobs(): ZaagJob[] {
  return buildJobs(reservationsStore.list()).filter(j => j.status !== 'done')
}

function StatusBadge({ status }: { status: ZaagJob['status'] }) {
  const map = {
    open:        { bg: 'var(--bg-chip)', color: 'var(--text-3)', label: 'Open'  },
    in_progress: { bg: '#fff7ed',        color: '#c2410c',       label: 'Bezig' },
    done:        { bg: '#f0fdf4',        color: '#15803d',       label: 'Klaar' },
  }
  const { bg, color, label } = map[status]
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: bg, color }}>{label}</span>
}

export function ZaagPlannerPage() {
  const [jobs, handlers] = useListState<ZaagJob>(activeJobs())
  // Mirror of current state, readable inside event handlers without stale closures.
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs
  // Set while we write our own plan, so the change-event listener ignores it.
  const writingRef = useRef(false)

  // Persist the full ordering: priority 1..N + rush flag, one write.
  function persist(order: ZaagJob[]) {
    writingRef.current = true
    reservationsStore.applyPlan(
      order.map(j => ({ ids: j.reservations.map(r => r.id), rush: j.rush }))
    )
    writingRef.current = false
  }

  // Re-sync when reservations change elsewhere (calculator add / zaagflow complete).
  useEffect(() => {
    const onChange = () => {
      if (writingRef.current) return // our own write — ignore
      const fresh = activeJobs()
      const prev = jobsRef.current
      const prevKeys = new Set(prev.map(j => j.calcNr))
      const sameSet = fresh.length === prevKeys.size && fresh.every(j => prevKeys.has(j.calcNr))
      if (sameSet) {
        // Same jobs — keep the operator's manual order, just refresh job data.
        handlers.setState(prev.map(pj => fresh.find(f => f.calcNr === pj.calcNr) ?? pj))
      } else {
        // Jobs added/removed — adopt the freshly-sorted list.
        handlers.setState(fresh)
      }
    }
    window.addEventListener('sm-reservations-changed', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('sm-reservations-changed', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onDragEnd({ source, destination }: DropResult) {
    if (!destination || destination.index === source.index) return
    const reordered = [...jobsRef.current]
    const [moved] = reordered.splice(source.index, 1)
    reordered.splice(destination.index, 0, moved)
    handlers.setState(reordered)
    persist(reordered)
  }

  function toggleRush(idx: number) {
    const cur = jobsRef.current
    const newRush = !cur[idx].rush
    let next = cur.map((j, i) => (i === idx ? { ...j, rush: newRush } : j))
    if (newRush) {
      // Turning rush on pins the job to the top of the queue.
      const [moved] = next.splice(idx, 1)
      next = [moved, ...next]
    }
    handlers.setState(next)
    persist(next)
  }

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Zaag planner</div>
          <div className="st-page-sub">Sleep om de zaagvolgorde te bepalen — bovenaan = eerst</div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="st-empty" style={{ marginTop: 48 }}>
          <IconAlertTriangle size={22} style={{ color: 'var(--text-4)', marginBottom: 8 }} />
          <div>Geen jobs in de wachtrij</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            Reserveringen worden aangemaakt via de <strong>Zaag calculator</strong>.
          </div>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="zaagplanner">
            {provided => (
              <div className="zplan-list" ref={provided.innerRef} {...provided.droppableProps}>
                {jobs.map((job, index) => (
                  <Draggable key={job.calcNr} draggableId={job.calcNr} index={index}>
                    {(prov, snapshot) => (
                      <div
                        className={`zplan-row${snapshot.isDragging ? ' dragging' : ''}${job.rush ? ' rush' : ''}`}
                        ref={prov.innerRef}
                        {...prov.draggableProps}
                      >
                        <div className="zplan-handle" {...prov.dragHandleProps}>
                          <IconGripVertical size={18} />
                        </div>
                        <div className="zplan-pos">{index + 1}</div>
                        <div className="zplan-main">
                          <div className="zplan-row-top">
                            <span className="zplan-calcnr">
                              {job.calcNr === '—' ? 'Zonder calculatienummer' : job.calcNr}
                            </span>
                            <StatusBadge status={job.status} />
                            {job.rush && <span className="zplan-spoed-badge">SPOED</span>}
                          </div>
                          <div className="zplan-row-sub">
                            <span>{job.machine}</span>
                            <span>{job.materiaal} Ø{job.diameter} mm</span>
                            <span>
                              {job.reservations.length} {job.reservations.length === 1 ? 'as' : 'assen'} · {job.totalPcs} stuks
                            </span>
                          </div>
                        </div>
                        <button
                          className={`zplan-spoed-btn${job.rush ? ' on' : ''}`}
                          onClick={() => toggleRush(index)}
                          title={job.rush ? 'Spoed uitzetten' : 'Markeer als spoed (naar boven)'}
                        >
                          <IconBolt size={14} />
                          Spoed
                        </button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </>
  )
}
