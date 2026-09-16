import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconChevronRight, IconCheck,
  IconBulb, IconFileText, IconCircleCheck, IconTool,
  IconPackage, IconSend, IconReceipt, IconArrowBackUp, IconExternalLink,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { projectsApi, formatBedrag, getAcceptedOfferte, getProjectSubtotaal, allOrdersGereed } from '../../api/projects'
import { relatiesApi } from '../../api/relaties'
import { PROJECT_STATUS_CONFIG } from '../../components/projecten/projectColumns'
import { ProjectInfoCard, toProjectMeta, type ProjectMeta } from '../../components/projecten/ProjectInfoCard'
import { pageTabs } from '../../utils/pageTabs'
import { usePopoutRoutes } from '../../hooks/usePopout'
import { focusPopout, requestClosePopout } from '../../utils/popout'
import { useProjectLock } from '../../hooks/useProjectLock'
import { useProjectSaveState } from '../../hooks/useProjectSaveState'
import { IconLock, IconCloudCheck, IconCloudUpload, IconCloudX, IconMail } from '@tabler/icons-react'
import { Ic, Icon } from '../../components/articles/calc-icons'
import { MailDropzone } from '../../components/projecten/MailDropzone'
import { MailImportReview } from '../../components/projecten/MailImportReview'
import { ProjectStatusActies } from '../../components/projecten/ProjectStatusActies'
import { ProjectReserveringen } from '../../components/projecten/ProjectReserveringen'
import { ProjectNacalculatieTab } from '../../components/nacalculatie/ProjectNacalculatieTab'
import { mailImportsApi } from '../../api/mail-imports'
import { articlesApi } from '../../api/articles'
import type { MailImport } from '@stockmanager/shared'
import { OfferteTab } from '../../components/projecten/OfferteTab'
import { OpdrachtbevestigingTab } from '../../components/projecten/OpdrachtbevestigingTab'
import { ProductieTab } from '../../components/projecten/ProductieTab'
import { PaklijstTab } from '../../components/projecten/PaklijstTab'
import { FactuurTab } from '../../components/projecten/FactuurTab'
import type { Project } from '@stockmanager/shared'
import { laatstePaklijst, berekenVoortgang, basisRegels } from '@stockmanager/shared'
import { useUserStore } from '../../stores/user'
import { ProjectSamenvatting } from '../../components/projecten/voortgang/ProjectSamenvatting'
import { ProjectMatrix } from '../../components/projecten/voortgang/ProjectMatrix'
import { bouwStapActies } from '../../components/projecten/voortgang/stap-acties'
import { ProjectKop } from '../../components/projecten/voortgang/ProjectKop'

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

const TABS = ['offertes', 'opdrachtbevestiging', 'productie', 'nacalculatie', 'paklijst', 'factuur'] as const
type Tab = typeof TABS[number]

// De open tab staat in de URL (?tab=factuur) zodat een document deelbaar en te
// bookmarken is: /projecten/PRJ-2026-003?tab=factuur opent meteen de factuur.
// De documentenpagina (punt 2 uit features/61-orderproces-backlog.md) linkt
// hierop. Zonder parameter, of bij een onbekende waarde, staat de offertetab
// open — dat is waar een project begint.
const STANDAARD_TAB: Tab = 'offertes'

function leesTab(waarde: string | null): Tab {
  return (TABS as readonly string[]).includes(waarde ?? '') ? (waarde as Tab) : STANDAARD_TAB
}

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

  const [searchParams, setSearchParams] = useSearchParams()
  const tab = leesTab(searchParams.get('tab'))
  // `replace` zodat vijf keer klikken geen vijf stappen in de geschiedenis
  // oplevert waar je doorheen moet om de pagina te verlaten.
  const setTab = useCallback((t: Tab) => {
    setSearchParams(vorige => {
      const volgende = new URLSearchParams(vorige)
      if (t === STANDAARD_TAB) volgende.delete('tab')
      else volgende.set('tab', t)
      return volgende
    }, { replace: true })
  }, [setSearchParams])
  const [confirmRevert, setConfirmRevert] = useState(false)
  // Welke stopactie in het menu gekozen is; het redenveld verschijnt dan onder
  // de kopregel.
  const [stopSoort, setStopSoort] = useState<'on_hold' | 'geannuleerd' | null>(null)
  const user = useUserStore(s => s.user)
  // De tabbladen zitten nu achter één knop. De matrix is het scherm; de tabs
  // zijn het detailwerk per document — notities op een pakbon, btw op een
  // factuur, de offerte-PDF. In de url zodat een herlaadactie hem openhoudt.
  const toonDocumenten = searchParams.get('docs') === '1'
  const zetDocumenten = useCallback((aan: boolean) => {
    setSearchParams(vorige => {
      const volgende = new URLSearchParams(vorige)
      if (aan) volgende.set('docs', '1')
      else { volgende.delete('docs'); volgende.delete('tab') }
      return volgende
    }, { replace: true })
  }, [setSearchParams])
  // Mail-import (features/60-mail-import.md §2.2/§3.7): een gesleepte mail komt
  // eerst in `reviewImport` en raakt het project pas als iemand hem koppelt.
  const [reviewImport, setReviewImport] = useState<MailImport | null>(null)
  const [linkedImport, setLinkedImport] = useState<MailImport | null>(null)
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

  // Al een mail aan dit project gekoppeld? Dan geen dropzone meer tonen maar
  // waar hij vandaan komt. Faalt stil: een project blijft bruikbaar als de
  // mail-import-route onbereikbaar is.
  useEffect(() => {
    let cancelled = false
    if (!id) return
    mailImportsApi.list({ projectId: id })
      .then(rows => { if (!cancelled) setLinkedImport(rows[0] ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [id])

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

  // Voor het koppelen van mailregels aan artikelen (§3.5).
  const articleOptions = articlesApi.list()
    .map(a => ({ value: a.id, label: a.tekening ? `${a.tekening} · ${a.naam}` : a.naam }))

  // De voortgang komt uit de gedeelde rekenkern — hetzelfde sommetje als op de
  // server, zodat het scherm en de database niet elk hun eigen waarheid hebben.
  const voortgang = berekenVoortgang(project)
  const stapActies = bouwStapActies(
    project, voortgang, rerender, t => { zetDocumenten(true); setTab(t as Tab) },
    isReadOnly, user?.name ?? 'Onbekend',
  )
  // Het nummer dat de klant ziet: alle versies van een offerte delen het.
  const offerteNr = project.offertes[0]?.documentNr ?? null


  const metaLine = [
    project.id,
    relatie?.naam || null,
    contact?.naam || null,
    meta.klantRef ? `ref ${meta.klantRef}` : null,
  ].filter(Boolean).join(' · ')


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
      blocked: !!laatstePaklijst(project)?.verzondenOp,
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

  const stilgezet = project.status === 'on_hold' || project.status === 'geannuleerd'

  // Het menu achter de drie puntjes: de uitzonderingen. Terugkeren naar een
  // vorige stap staat er ook in, mét de reden als het niet mag — een knop die
  // zomaar weg is, laat je zoeken.
  const kopMenu: { label: string; fn: () => void; uit?: string; kleur?: string }[] = isReadOnly
    ? []
    : stilgezet
      ? [{ label: `Hervatten naar ${project.statusVorige ?? 'concept'}`, fn: () => { projectsApi.hervatProject(id); rerender() } }]
      : [
          ...(revertCfg
            ? [{
                label: revertCfg.label,
                uit: revertCfg.blocked ? revertCfg.guard : undefined,
                fn: () => setConfirmRevert(true),
              }]
            : []),
          { label: 'On hold zetten', fn: () => setStopSoort('on_hold') },
          { label: 'Annuleren', fn: () => setStopSoort('geannuleerd'), kleur: 'var(--danger)' },
        ]

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

      {/* De kopregel, precies zoals het ontwerp: mapje, projectnummer, naam,
          en rechts Documenten plus een menu. De stappenbalk met zeven bolletjes
          is weg — de kolomgroepen in de tabel zijn nu de stappen, mét hun
          eigen knop, en twee stappenrijen boven elkaar is er één te veel. */}
      <ProjectKop
        project={project}
        naam={meta.naam}
        onNaam={naam => setMeta({ naam })}
        documentenAantal={
          project.offertes.length + project.paklijsten.length + project.facturen.length
          + (project.opdrachtbevestiging ? 1 : 0)
        }
        documentenOpen={toonDocumenten}
        onDocumenten={() => zetDocumenten(!toonDocumenten)}
        alleenLezen={isReadOnly}
        statusLabel={stilgezet ? cfg.label : null}
        statusReden={project.statusReden}
        opslaanIndicator={!isReadOnly && <SaveIndicator state={saveState} />}
        menu={kopMenu}
      />

      {/* Het redenveld van on hold / annuleren: alleen zichtbaar zodra je het
          uit het menu kiest. Een reden is verplicht — een project dat stilligt
          zonder uitleg levert over een maand alleen maar vragen op. */}
      {stopSoort && (
        <div style={{
          background: 'var(--warning-soft)', borderBottom: '1px solid var(--border)',
          padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <ProjectStatusActies
            project={project}
            onChanged={() => { setStopSoort(null); rerender() }}
            kiezen={stopSoort}
            onKiezen={setStopSoort}
          />
        </div>
      )}


        {/* Projectgegevens: één regel, geen vier kaarten.
            De kaarten Offerte/Productie/Financieel zeiden hetzelfde als de
            matrix eronder, maar met andere getallen — "0 / 2 klaar" telt hele
            orders, de matrix telt stuks. Twee waarheden op één scherm is erger
            dan één. Wat hier overblijft is wat je hier invult en nergens
            anders: klant, contact, referentie en leverdatum. */}
        <ProjectInfoCard
          meta={meta}
          onChange={setMeta}
          relatieOptions={relatieOptions}
          relatie={relatie}
          readOnly={isReadOnly}
        />

      {/* Mail-import — alleen op een leeg project, zolang er nog geen offerte is */}
      {!isReadOnly && !linkedImport && project.offertes.length === 0 && (
        <MailDropzone projectId={project.id} onImported={setReviewImport} />
      )}
      {linkedImport && (
        <div className="prj-mail-linked">
          <IconMail size={14} />
          <span>
            Uit mail: <strong>{linkedImport.onderwerp || '(geen onderwerp)'}</strong>
            {linkedImport.afzenderEmail && <span className="mono"> · {linkedImport.afzenderEmail}</span>}
          </span>
          <button className="st-btn ghost sm" onClick={() => setReviewImport(linkedImport)}>Bekijk</button>
        </div>
      )}
      {reviewImport && (
        <MailImportReview
          opened
          mailImport={reviewImport}
          projectId={project.id}
          relaties={relaties}
          articleOptions={articleOptions}
          project={project}
          onClose={() => setReviewImport(null)}
          onOfferteChanged={rerender}
          onUnlinked={() => {
            // Alleen de koppeling verdwijnt; aan het project zelf verandert
            // niets, dus ook de relatie en de ordergegevens blijven staan.
            setLinkedImport(null)
            rerender()
          }}
          onLinked={(saved, relatieId) => {
            setLinkedImport(saved)
            // De relatie uit het reviewscherm is de bevestigde keuze; die hoort
            // meteen op het project te staan, samen met het onderwerp als naam
            // wanneer het project nog naamloos is.
            // Ook de ordergegevens uit de mail: het kenmerk waarmee de klant
            // hiernaar verwijst, en de datum waarop hij het wil hebben. Alleen
            // wat nog leeg is — wie het zelf invulde had daar een reden voor.
            // Dit gebeurt hier en niet in mail-naar-offerte.ts, omdat deze
            // pagina die velden bezit en ze met een debounce persisteert.
            setMeta({
              relatieId,
              ...(saved.contactId ? { contactId: saved.contactId } : {}),
              ...(meta.naam.trim() ? {} : { naam: saved.onderwerp.slice(0, 80) }),
              ...(meta.klantRef.trim() || !saved.klantRef ? {} : { klantRef: saved.klantRef }),
              ...(meta.levertijdDatum.trim() || !saved.leverdatum
                ? {}
                : { levertijdDatum: saved.leverdatum.slice(0, 10) }),
            })
            notifications.show({ color: 'green', message: 'Mail gekoppeld aan dit project.' })
          }}
        />
      )}

      {/* De matrix: de vier stappen als kolomgroepen, elk met zijn eigen
          volgende handeling in de kop. Dit is het scherm — de tabbladen
          hieronder zijn het detailwerk per document. */}
      <ProjectSamenvatting project={project} voortgang={voortgang} />
      <div className={isReadOnly ? 'prj-ro-shield' : undefined}>
        <ProjectMatrix
          project={project}
          voortgang={voortgang}
          regels={basisRegels(project)}
          acties={stapActies}
          offerteNr={offerteNr}
          onPakbon={() => { zetDocumenten(true); setTab('paklijst') }}
          onArtikel={artikelId => navigate(`/artikelen/${artikelId}`)}
        />
      </div>

      {toonDocumenten && (
        <>
          <div className="detail-tabs" style={{ marginTop: 16 }}>
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
            <button data-active={tab === 'nacalculatie'} onClick={() => setTab('nacalculatie')}>
              Nacalculatie
            </button>
            <button data-active={tab === 'paklijst'} onClick={() => setTab('paklijst')}>
              Pakbonnen
              {project.paklijsten.length > 0 && <span className="tab-count">{project.paklijsten.length}</span>}
            </button>
            <button data-active={tab === 'factuur'} onClick={() => setTab('factuur')}>
              Facturen
              {project.facturen.length > 0 && <span className="tab-count">{project.facturen.length}</span>}
            </button>
          </div>

          <div className={`tab-body${isReadOnly ? ' prj-ro-shield' : ''}`}>
            {tab === 'offertes'             && <OfferteTab               project={project} onChanged={rerender} />}
            {tab === 'opdrachtbevestiging'  && <OpdrachtbevestigingTab   project={project} onChanged={rerender} />}
            {tab === 'productie'            && <>
              <ProductieTab project={project} onChanged={rerender} />
              <ProjectReserveringen projectId={project.id} />
            </>}
            {tab === 'nacalculatie'         && <ProjectNacalculatieTab   projectId={project.id} />}
            {tab === 'paklijst'             && <PaklijstTab              project={project} onChanged={() => { rerender() }} />}
            {tab === 'factuur'              && <FactuurTab               project={project} onChanged={() => { rerender() }} />}
          </div>
        </>
      )}
    </>
  )
}
