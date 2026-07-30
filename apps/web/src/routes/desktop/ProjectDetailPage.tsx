import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconChevronRight, IconCheck,
  IconBulb, IconFileText, IconCircleCheck, IconTool,
  IconPackage, IconSend, IconReceipt, IconArrowBackUp, IconExternalLink,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { projectsApi, formatBedrag, getAcceptedOfferte, getProjectSubtotaal, allOrdersGereed } from '../../api/projects'
import { relatiesApi } from '../../api/relaties'
import { PROJECT_STATUS_CONFIG } from './ProjectenPage'
import { ProjectInfoCard, toProjectMeta, type ProjectMeta } from '../../components/projecten/ProjectInfoCard'
import { pageTabs } from '../../utils/pageTabs'
import { usePopoutRoutes } from '../../hooks/usePopout'
import { focusPopout, requestClosePopout } from '../../utils/popout'
import { useProjectLock } from '../../hooks/useProjectLock'
import { useProjectSaveState } from '../../hooks/useProjectSaveState'
import { IconLock, IconCloudCheck, IconCloudUpload, IconCloudX } from '@tabler/icons-react'
import { Ic, Icon } from '../../components/articles/calc-icons'
import { OfferteTab } from '../../components/projecten/OfferteTab'
import { OpdrachtbevestigingTab } from '../../components/projecten/OpdrachtbevestigingTab'
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

function StageTrack({ status, compact = false }: { status: Project['status']; compact?: boolean }) {
  const activeIdx = STATUS_IDX[status]
  return (
    <div className={`prj-stage-track${compact ? ' compact' : ''}`}>
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
                {isDone ? <IconCheck size={compact ? 13 : 11} /> : STAGE_ICONS[i]}
              </div>
              <div className={`prj-stage-lbl ${cls}`}>{label}</div>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Autosave indicator ──────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null
  const cfg = {
    saving: { cls: 'saving', icon: <IconCloudUpload size={13} />, label: 'Bezig met opslaan…' },
    saved:  { cls: 'saved',  icon: <IconCloudCheck size={13} />,  label: 'Opgeslagen' },
    error:  { cls: 'error',  icon: <IconCloudX size={13} />,      label: 'Niet opgeslagen' },
  }[state]
  return (
    <span className={`prj-save-ind ${cfg.cls}`} title={cfg.label}>
      {cfg.icon}{cfg.label}
    </span>
  )
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type Tab = 'offertes' | 'opdrachtbevestiging' | 'productie' | 'paklijst' | 'factuur'

// ── Page ──────────────────────────────────────────────────────────────────────

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const navigate     = useNavigate()
  const relaties     = relatiesApi.listSync()
  const poppedOut    = usePopoutRoutes()
  // This same component renders inside the detached popout window too; only the
  // MAIN window should swap in the "open elsewhere" placeholder for a project.
  const inPopoutWindow = window.location.pathname.startsWith('/pop/')
  const isPoppedOut    = !inPopoutWindow && poppedOut.has(`/projecten/${id}`)
  // Cross-user edit lock. Don't claim it in the main window while the project
  // is popped out — the detached window holds the lock there.
  const { isReadOnly, holderName, holderIdle } = useProjectLock(id, !isPoppedOut)
  const saveState = useProjectSaveState(id)

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

  const [tab, setTab]           = useState<Tab>('offertes')
  const [confirmRevert, setConfirmRevert] = useState(false)
  const [meta, setMetaState] = useState<ProjectMeta>({ naam: '', relatieId: null, contactId: null, klantRef: '', levertijdDatum: '' })
  const qc = useQueryClient()
  const [, forceUpdate] = useState(0)
  // projectsApi mutations write straight into its in-memory cache and return
  // synchronously — invalidate so the useQuery above re-reads that cache
  // (instead of serving its now-stale cached result), same as forceUpdate
  // used to force a fresh synchronous read under the old code.
  const rerender = () => { forceUpdate(n => n + 1); qc.invalidateQueries({ queryKey: ['projects', id] }) }

  // ── Inline meta editing (no edit mode) — seed once per project id, then treat
  //    local `meta` as the source of truth so a background refetch (triggered by
  //    our own debounced save) never clobbers in-progress typing. Mirrors the
  //    article-detail redesign. ──
  const metaInited = useRef<string | null>(null)
  const metaDirty = useRef(false)
  useEffect(() => {
    if (!project || metaInited.current === project.id) return
    metaInited.current = project.id
    metaDirty.current = false
    setMetaState(toProjectMeta(project))
  }, [project])

  // Debounced persist of meta. Never persist while read-only (someone else
  // holds the lock) — the inputs are disabled anyway, this is belt-and-braces.
  useEffect(() => {
    if (!project || metaInited.current !== project.id || !metaDirty.current || isReadOnly) return
    const t = setTimeout(() => saveMeta(), 400)
    return () => clearTimeout(t)
  }, [meta]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register (and keep labelled) an open-projects tab for whatever project is
  // on screen — covers every entry point (list click, create, direct URL).
  useEffect(() => {
    if (project) pageTabs.open(`/projecten/${project.id}`, meta.naam.trim() || project.id)
  }, [project?.id, meta.naam]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) return null

  if (!project) {
    return (
      <>
        <div className="st-page-hd">
          <div>
            <button className="st-btn ghost sm" onClick={() => navigate('/projecten')}>
              <IconChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />Projecten
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

  // Project is open in its own detached window — show a placeholder here rather
  // than a second live copy (mirrors AppLayout's PopoutAware for singleton pages).
  if (isPoppedOut) {
    return (
      <div className="st-popout-placeholder">
          <div className="ic"><IconExternalLink size={22} /></div>
          <div className="t">{meta.naam || project.id} is open in een apart venster</div>
          <div className="d">Gebruik dat venster, of haal het project terug naar het hoofdvenster.</div>
          <div className="actions">
            <button className="btn" onClick={() => focusPopout(`/projecten/${id}`)}>Venster tonen</button>
            <button className="btn primary" onClick={() => requestClosePopout(`/projecten/${id}`)}>Sluit venster, toon hier</button>
          </div>
      </div>
    )
  }

  const setMeta = (patch: Partial<ProjectMeta>) => {
    metaDirty.current = true
    setMetaState(m => ({ ...m, ...patch }))
  }

  function saveMeta() {
    projectsApi.update(project!.id, {
      naam: meta.naam.trim() || project!.id,
      relatieId: meta.relatieId,
      contactId: meta.contactId,
      klantRef: meta.klantRef.trim() || null,
      levertijdDatum: meta.levertijdDatum.trim() || null,
    })
    rerender()
  }

  const cfg      = PROJECT_STATUS_CONFIG[project.status]
  // Header identity is inline-editable now, so derive the selected relatie/
  // contact from live `meta` (not the persisted project) — keeps the title
  // meta-line and the Klant card in sync while typing.
  const relatie  = relaties.find(r => r.id === meta.relatieId) ?? null
  const contact  = relatie?.contacten.find(c => c.id === meta.contactId) ?? null
  const accepted = getAcceptedOfferte(project)
  const subtotaal = getProjectSubtotaal(project)
  const gereedCount = project.productieOrders.filter(o => o.status === 'gereed').length
  const totalOrders = project.productieOrders.length

  const relatieOptions = relaties
    .filter(r => r.type !== 'leverancier')
    .map(r => ({ value: r.id, label: r.naam }))

  const metaLine = [
    project.id,
    relatie?.naam || null,
    contact?.naam || null,
    meta.klantRef ? `ref ${meta.klantRef}` : null,
  ].filter(Boolean).join(' · ')

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

  // Map each status to what it reverts to and which API call to make
  const REVERT_CONFIG: Partial<Record<Project['status'], {
    label: string
    guard?: string   // shown instead of button when blocked
    blocked?: boolean
    fn: () => void
  }>> = {
    bevestigd: {
      label: 'Terug naar offerte',
      blocked: project.productieOrders.some(o => o.stappen.some(s => s.gereedOp)),
      guard: 'Stappen zijn al afgevinkt',
      fn: () => { projectsApi.revertBevestigd(id); rerender(); setTab('offertes') },
    },
    productie: {
      label: 'Terug naar bevestigd',
      blocked: project.productieOrders.some(o => o.status === 'gereed'),
      guard: 'Orders zijn al gereedgemeld',
      fn: () => { projectsApi.revertProductie(id); rerender(); setTab('opdrachtbevestiging') },
    },
    paklijst: {
      label: 'Terug naar productie',
      blocked: !!project.paklijst?.verzondenOp,
      guard: 'Paklijst is al verzonden',
      fn: () => { projectsApi.revertPaklijst(id); rerender(); setTab('productie') },
    },
    verzonden: {
      label: 'Terug naar paklijst',
      fn: () => { projectsApi.revertVerzonden(id); rerender(); setTab('paklijst') },
    },
    gefactureerd: {
      label: 'Terug naar verzonden',
      fn: () => { projectsApi.revertGefactureerd(id); rerender(); setTab('factuur') },
    },
  }

  const revertCfg = REVERT_CONFIG[project.status]

  function RevertBtn() {
    if (!revertCfg || project!.status === 'on_hold' || project!.status === 'geannuleerd') return null
    if (revertCfg.blocked) {
      return (
        <span style={{ fontSize: 11.5, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconArrowBackUp size={13} />{revertCfg.guard}
        </span>
      )
    }
    if (confirmRevert) {
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--danger)' }}>Zeker weten?</span>
          <button className="st-btn sm ghost" onClick={() => setConfirmRevert(false)}>Annuleer</button>
          <button className="st-btn sm danger" onClick={() => { setConfirmRevert(false); revertCfg.fn(); notifications.show({ color: 'orange', message: revertCfg.label }) }}>
            Ja, terugzetten
          </button>
        </div>
      )
    }
    return (
      <button className="st-btn sm ghost" onClick={() => setConfirmRevert(true)} title={revertCfg.label}>
        <IconArrowBackUp size={13} />{revertCfg.label}
      </button>
    )
  }

  return (
    <>
      {isReadOnly && (
        <div className="prj-lock-banner">
          <IconLock size={15} />
          <span>
            <strong>{holderName ?? 'Een andere gebruiker'}</strong> heeft dit project geopend — je kijkt in alleen-lezen modus.
            {holderIdle && ' (al 5 min inactief)'}
          </span>
        </div>
      )}

      {/* Header — redesigned to match the article-detail page (ad- look) */}
      <div className="prj-detail-hd">
        {/* Title bar */}
        <div className="ad-titlebar">
          <div className="ad-glyph">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="ad-title-mid">
            <div className="ad-title-row">
              <h1 className="ad-h1">
                {meta.naam || <span style={{ color: 'var(--text-4)', fontStyle: 'italic', fontWeight: 500 }}>Naamloos project</span>}
              </h1>
              <span className={`badge ${cfg.cls}`}><span className="dot" />{cfg.label}</span>
              <StageTrack status={project.status} compact />
            </div>
            <div className="ad-metaline">{metaLine}</div>
          </div>
          <div className="ad-title-actions">
            {!isReadOnly && <SaveIndicator state={saveState} />}
            {!isReadOnly && <RevertBtn />}
            {!isReadOnly && <NextActionBtn />}
          </div>
        </div>

        {/* Info cards */}
        <div className="prj-info-cards">
          <ProjectInfoCard
            meta={meta}
            onChange={setMeta}
            relatieOptions={relatieOptions}
            relatie={relatie}
            readOnly={isReadOnly}
          />

          {/* Offerte */}
          <div className="ad-card">
            <div className="ad-eyebrow"><Ic d={Icon.file} />Offerte</div>
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
          <div className="ad-card">
            <div className="ad-eyebrow"><Ic d={Icon.tool} />Productie</div>
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
          <div className="ad-card">
            <div className="ad-eyebrow"><Ic d={Icon.euro} />Financieel</div>
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
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        <button data-active={tab === 'offertes'} onClick={() => setTab('offertes')}>
          Offertes
          {project.offertes.length > 0 && <span className="tab-count">{project.offertes.length}</span>}
        </button>
        <button data-active={tab === 'opdrachtbevestiging'} onClick={() => setTab('opdrachtbevestiging')}>
          Opdrachtbevestiging
          {project.opdrachtbevestiging && project.opdrachtbevestiging.status !== 'verzonden' && (
            <span
              className="tab-count"
              style={{ background: 'var(--warning)', color: '#fff' }}
              title="Opdrachtbevestiging staat nog op concept en is nog niet verzonden naar de klant"
            >!</span>
          )}
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

      <div className={`tab-body${isReadOnly ? ' prj-ro-shield' : ''}`}>
        {tab === 'offertes'             && <OfferteTab               project={project} onChanged={rerender} />}
        {tab === 'opdrachtbevestiging'  && <OpdrachtbevestigingTab   project={project} onChanged={rerender} />}
        {tab === 'productie'            && <ProductieTab             project={project} onChanged={rerender} />}
        {tab === 'paklijst'             && <PaklijstTab              project={project} onChanged={() => { rerender() }} />}
        {tab === 'factuur'              && <FactuurTab               project={project} onChanged={() => { rerender() }} />}
      </div>
    </>
  )
}
