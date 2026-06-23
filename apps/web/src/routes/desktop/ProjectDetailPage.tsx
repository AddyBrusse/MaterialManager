import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconArrowLeft, IconCheck, IconPencil,
  IconBulb, IconFileText, IconCircleCheck, IconTool,
  IconPackage, IconSend, IconReceipt,
} from '@tabler/icons-react'
import { projectsApi, formatBedrag, formatDate, getAcceptedOfferte, getProjectSubtotaal, allOrdersGereed } from '../../api/projects'
import { relatiesApi } from '../../api/relaties'
import { useUserStore } from '../../stores/user'
import { PROJECT_STATUS_CONFIG } from './ProjectenPage'
import { OfferteTab } from '../../components/projecten/OfferteTab'
import { ProductieTab } from '../../components/projecten/ProductieTab'
import { PaklijstTab } from '../../components/projecten/PaklijstTab'
import { FactuurTab } from '../../components/projecten/FactuurTab'
import type { Project } from '@stockmanager/shared'

// ── Stage track ────────────────────────────────────────────────────────────────

const STAGES = ['Concept', 'Offerte', 'Bevestigd', 'Productie', 'Paklijst', 'Verzonden', 'Factuur']
const STATUS_IDX: Record<Project['status'], number> = {
  concept: 0, offerte: 1, bevestigd: 2, productie: 3,
  paklijst: 4, verzonden: 5, gefactureerd: 6,
  on_hold: -1, geannuleerd: -1,
}

const STAGE_ICONS = [
  <IconBulb size={12} />,
  <IconFileText size={12} />,
  <IconCircleCheck size={12} />,
  <IconTool size={12} />,
  <IconPackage size={12} />,
  <IconSend size={12} />,
  <IconReceipt size={12} />,
]

function StageTrack({ status }: { status: Project['status'] }) {
  const activeIdx = STATUS_IDX[status]
  return (
    <div className="prj-stage-track">
      {STAGES.map((label, i) => {
        const isDone   = i < activeIdx
        const isActive = i === activeIdx
        const cls      = isDone ? 'done' : isActive ? 'active' : 'pend'
        return (
          <React.Fragment key={label}>
            {i > 0 && (
              <div className={`prj-stage-conn ${i <= activeIdx ? 'done' : 'pend'}`} />
            )}
            <div className="prj-stage-step">
              <div className={`prj-stage-circ ${cls}`}>
                {isDone ? <IconCheck size={11} /> : STAGE_ICONS[i]}
              </div>
              <div className={`prj-stage-lbl ${cls}`}>{label}</div>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Inline-edit meta ──────────────────────────────────────────────────────────

interface ProjectMeta {
  naam: string
  relatieId: string | null
  contactId: string | null
  klantRef: string
  levertijdDatum: string
}

function toProjectMeta(p: Project): ProjectMeta {
  return {
    naam: p.naam,
    relatieId: p.relatieId,
    contactId: p.contactId,
    klantRef: p.klantRef ?? '',
    levertijdDatum: p.levertijdDatum ?? '',
  }
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type Tab = 'offertes' | 'productie' | 'paklijst' | 'factuur'

// ── Page ──────────────────────────────────────────────────────────────────────

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const navigate     = useNavigate()
  const isAdmin      = useUserStore(s => s.user?.role === 'admin')
  const relaties     = relatiesApi.listSync()

  // projectsApi.get() reads a synchronous in-memory cache that's only
  // populated once the background initProjects() fetch resolves — on a
  // fresh load that cache can still be empty at first render. Route it
  // through useQuery (with retries) instead of reading it once synchronously,
  // so the page waits for real data instead of permanently showing "not
  // found" if the first render beat initProjects() to the punch.
  const { data: project, isPending } = useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
    retry: 5,
    retryDelay: 300,
  })

  const [tab, setTab]       = useState<Tab>('offertes')
  const [editMode, setEdit] = useState(false)
  const [meta, setMetaState] = useState<ProjectMeta>({ naam: '', relatieId: null, contactId: null, klantRef: '', levertijdDatum: '' })
  const qc = useQueryClient()
  const [, forceUpdate] = useState(0)
  // projectsApi mutations write straight into its in-memory cache and return
  // synchronously — invalidate so the useQuery above re-reads that cache
  // (instead of serving its now-stale cached result), same as forceUpdate
  // used to force a fresh synchronous read under the old code.
  const rerender = () => { forceUpdate(n => n + 1); qc.invalidateQueries({ queryKey: ['projects', id] }) }

  // Project arrives asynchronously now (see useQuery above) — seed meta/
  // editMode the first time it loads, same as the old synchronous lazy
  // initializers did. Guarded so a later background refetch (e.g. another
  // tab invalidating ['projects']) doesn't stomp on in-progress edits.
  const metaInited = useRef<string | null>(null)
  useEffect(() => {
    if (!project || metaInited.current === project.id) return
    metaInited.current = project.id
    setMetaState(toProjectMeta(project))
    setEdit(!project.naam)
  }, [project])

  if (isPending) return null

  if (!project) {
    return (
      <>
        <div className="st-page-hd">
          <div>
            <button className="st-btn ghost sm" onClick={() => navigate('/projecten')}>
              <IconArrowLeft size={14} />Projecten
            </button>
            <div className="st-page-title" style={{ marginTop: 8 }}>Project niet gevonden</div>
          </div>
        </div>
        <div className="st-empty" style={{ marginTop: 32 }}>
          Project <strong>{id}</strong> bestaat niet (meer).
        </div>
      </>
    )
  }

  const setMeta = (patch: Partial<ProjectMeta>) => setMetaState(m => ({ ...m, ...patch }))

  function startEdit() {
    setMetaState(toProjectMeta(project!))
    setEdit(true)
  }
  function cancelEdit() {
    setMetaState(toProjectMeta(project!))
    setEdit(false)
  }
  function saveEdit() {
    projectsApi.update(project!.id, {
      naam: meta.naam.trim() || project!.id,
      relatieId: meta.relatieId,
      contactId: meta.contactId,
      klantRef: meta.klantRef.trim() || null,
      levertijdDatum: meta.levertijdDatum.trim() || null,
    })
    setEdit(false)
    rerender()
  }

  const cfg      = PROJECT_STATUS_CONFIG[project.status]
  const relatie  = relaties.find(r => r.id === project!.relatieId)
  const contact  = relatie?.contacten.find(c => c.id === project!.contactId)
  const accepted = getAcceptedOfferte(project)
  const subtotaal = getProjectSubtotaal(project)
  const gereedCount = project.productieOrders.filter(o => o.status === 'gereed').length
  const totalOrders = project.productieOrders.length

  // Contacts for edit-mode dropdown
  const editRelatie  = relaties.find(r => r.id === meta.relatieId)
  const editContacten = editRelatie?.contacten ?? []

  function NextActionBtn() {
    const { status } = project!
    if (status === 'concept' || status === 'offerte') {
      return (
        <button className="st-btn primary sm" onClick={() => setTab('offertes')}>
          Naar offertes →
        </button>
      )
    }
    if (status === 'productie' && allOrdersGereed(project!)) {
      return (
        <button className="st-btn primary sm" onClick={() => { projectsApi.createPaklijst(id); rerender(); setTab('paklijst') }}>
          Paklijst aanmaken →
        </button>
      )
    }
    if (status === 'bevestigd' || status === 'productie') {
      return <button className="st-btn primary sm" onClick={() => setTab('productie')}>Naar productie →</button>
    }
    if (status === 'paklijst') {
      return <button className="st-btn primary sm" onClick={() => setTab('paklijst')}>Naar paklijst →</button>
    }
    if (status === 'verzonden') {
      return <button className="st-btn primary sm" onClick={() => setTab('factuur')}>Factuur aanmaken →</button>
    }
    return null
  }

  return (
    <>
      {/* Header */}
      <div className="detail-head">
        <button className="detail-back" onClick={() => navigate('/projecten')}>
          <IconArrowLeft size={13} />Projecten
        </button>
        <div className="detail-top" style={{ alignItems: 'center', gap: 12 }}>
          <div className="detail-icon" style={{ background: 'var(--bg-chip)', flexShrink: 0 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="detail-id" style={{ flex: 'none', minWidth: 0 }}>
            <div className="detail-name">
              {editMode
                ? <input
                    className="info-primary-inp"
                    placeholder="Projectnaam…"
                    style={{ maxWidth: 280 }}
                    value={meta.naam}
                    onChange={e => setMeta({ naam: e.target.value })}
                    autoFocus
                  />
                : (project.naam || <span style={{ color: 'var(--text-4)', fontStyle: 'italic' }}>Naamloos project</span>)}
              <span className={`badge ${cfg.cls}`}><span className="dot" />{cfg.label}</span>
            </div>
            {!editMode && (relatie || project.klantRef) && (
              <div className="detail-meta">
                {relatie && relatie.naam}
                {contact && ` · ${contact.naam}`}
                {project.klantRef && ` · ref ${project.klantRef}`}
              </div>
            )}
          </div>
          {/* Stage track inline — takes remaining space */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <StageTrack status={project.status} />
          </div>
        </div>
      </div>

      {/* Action buttons — above KPI bar */}
      <div className="prj-action-bar">
        {editMode ? (
          <>
            <button className="btn" onClick={cancelEdit}>Annuleren</button>
            <button className="btn primary" onClick={saveEdit}>
              <IconCheck size={13} />Opslaan
            </button>
          </>
        ) : (
          <>
            {isAdmin && <button className="btn" onClick={startEdit}><IconPencil size={13} />Bewerken</button>}
            <NextActionBtn />
          </>
        )}
      </div>

      {/* Info strip */}
      <div className={`detail-info prj-info-strip${editMode ? ' editing' : ''}`}>
        {/* Klant */}
        <div className={`info-group${editMode ? ' editing' : ''}`}>
          <div className="info-group-label">Klant</div>
          {editMode ? (
            <select
              className="info-primary-inp"
              value={meta.relatieId ?? ''}
              onChange={e => setMeta({ relatieId: e.target.value || null, contactId: null })}
            >
              <option value="">— Geen klant —</option>
              {relaties.filter(r => r.type !== 'leverancier').map(r => (
                <option key={r.id} value={r.id}>{r.naam}</option>
              ))}
            </select>
          ) : (
            <div className="info-primary">
              {relatie?.naam ?? <span style={{ color: 'var(--text-4)', fontStyle: 'italic', fontSize: 14 }}>Geen klant</span>}
            </div>
          )}
          <div className="info-rows">
            {editMode && editContacten.length > 0 && (
              <div className="info-line">
                <span className="k">Contact</span>
                <select
                  className="info-sel"
                  value={meta.contactId ?? ''}
                  onChange={e => setMeta({ contactId: e.target.value || null })}
                >
                  <option value="">—</option>
                  {editContacten.map(c => <option key={c.id} value={c.id}>{c.naam}</option>)}
                </select>
              </div>
            )}
            {!editMode && (
              <div className="info-line">
                <span className="k">Contact</span>
                <span className="v">{contact?.naam ?? '—'}</span>
              </div>
            )}
            <div className="info-line">
              <span className="k">Ref. klant</span>
              {editMode
                ? <input className="info-inp" placeholder="—" value={meta.klantRef} onChange={e => setMeta({ klantRef: e.target.value })} />
                : <span className="v">{project.klantRef ?? '—'}</span>}
            </div>
            <div className="info-line">
              <span className="k">Levertijd</span>
              {editMode
                ? <input className="info-inp" type="date" value={meta.levertijdDatum} onChange={e => setMeta({ levertijdDatum: e.target.value })} />
                : <span className="v">{project.levertijdDatum ? formatDate(project.levertijdDatum) : '—'}</span>}
            </div>
          </div>
        </div>

        {/* Offerte */}
        <div className="info-group">
          <div className="info-group-label">Offerte</div>
          <div className="info-primary mono">
            {accepted?.id ?? (project.offertes.length > 0 ? project.offertes[project.offertes.length - 1].id : '—')}
          </div>
          <div className="info-rows">
            <div className="info-line">
              <span className="k">Versie</span>
              <span className="v">
                {accepted
                  ? `v${accepted.versie} · geaccepteerd`
                  : project.offertes.length > 0
                  ? `v${project.offertes[project.offertes.length - 1].versie} · ${project.offertes[project.offertes.length - 1].status}`
                  : '—'}
              </span>
            </div>
            <div className="info-line">
              <span className="k">Artikelen</span>
              <span className="v">
                {(accepted ?? project.offertes[project.offertes.length - 1])?.regels.length ?? 0} regels
              </span>
            </div>
            <div className="info-line">
              <span className="k">Bedrag excl.</span>
              <span className="v mono">{subtotaal > 0 ? formatBedrag(subtotaal) : '—'}</span>
            </div>
          </div>
        </div>

        {/* Productie */}
        <div className="info-group">
          <div className="info-group-label">Productie</div>
          <div className="info-primary">
            {totalOrders > 0 ? `${gereedCount} / ${totalOrders} klaar` : '—'}
          </div>
          <div className="info-rows">
            <div className="info-line">
              <span className="k">Gereed</span>
              <span className="v" style={gereedCount > 0 ? { color: 'var(--success)' } : {}}>
                {gereedCount} orders
              </span>
            </div>
            <div className="info-line">
              <span className="k">In productie</span>
              <span className="v" style={project.productieOrders.filter(o => o.status === 'in_productie').length > 0 ? { color: 'var(--warning)' } : {}}>
                {project.productieOrders.filter(o => o.status === 'in_productie').length} orders
              </span>
            </div>
            <div className="info-line">
              <span className="k">Paklijst</span>
              <span className="v">{project.paklijst?.id ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* Financieel */}
        <div className="info-group">
          <div className="info-group-label">Financieel</div>
          <div className="info-primary mono">{subtotaal > 0 ? formatBedrag(subtotaal) : '—'}</div>
          <div className="info-rows">
            <div className="info-line">
              <span className="k">Excl. BTW</span>
              <span className="v mono">{subtotaal > 0 ? formatBedrag(subtotaal) : '—'}</span>
            </div>
            <div className="info-line">
              <span className="k">BTW 21%</span>
              <span className="v mono">
                {subtotaal > 0 ? formatBedrag(Math.round(subtotaal * 0.21 * 100) / 100) : '—'}
              </span>
            </div>
            <div className="info-line">
              <span className="k">Incl. BTW</span>
              <span className="v mono">
                {subtotaal > 0 ? formatBedrag(Math.round(subtotaal * 1.21 * 100) / 100) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        <button data-active={tab === 'offertes'} onClick={() => setTab('offertes')}>
          Offertes
          {project.offertes.length > 0 && <span className="tab-count">{project.offertes.length}</span>}
        </button>
        <button data-active={tab === 'productie'} onClick={() => setTab('productie')}>
          Productie
          {project.productieOrders.length > 0 && <span className="tab-count">{project.productieOrders.length}</span>}
        </button>
        <button data-active={tab === 'paklijst'} onClick={() => setTab('paklijst')}>
          Paklijst
          {project.paklijst && <span className="tab-count">1</span>}
        </button>
        <button data-active={tab === 'factuur'} onClick={() => setTab('factuur')}>
          Factuur
          {project.factuur && <span className="tab-count">1</span>}
        </button>
      </div>

      <div className="tab-body">
        {tab === 'offertes'  && <OfferteTab   project={project} onChanged={rerender} />}
        {tab === 'productie' && <ProductieTab  project={project} onChanged={rerender} />}
        {tab === 'paklijst'  && <PaklijstTab   project={project} onChanged={() => { rerender() }} />}
        {tab === 'factuur'   && <FactuurTab    project={project} onChanged={() => { rerender() }} />}
      </div>
    </>
  )
}
