import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconUpload } from '@tabler/icons-react'
import { articlesApi, type Article, type ArticleEstimate } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { relatiesApi } from '../../api/relaties'
import { buildEstimateCtx, computeEstimateTotals } from '../../api/estimate'
import { useUserStore } from '../../stores/user'
import { useArticleAttachmentUpload } from '../../hooks/useArticleAttachmentUpload'
import { useWholePageDrop } from '../../hooks/useWholePageDrop'
import { ArticleCalculator } from '../../components/articles/ArticleCalculator'
import { ArticleInfoCard, toArticleMeta, type ArticleMeta } from '../../components/articles/ArticleInfoStrip'
import { ArticleFinancialCard } from '../../components/articles/ArticleFinancialCard'
import { ArticleFileViewer } from '../../components/articles/ArticleFileViewer'
import { LocationPickerModal } from '../../components/articles/LocationPickerModal'
import { ArticleFilesTab } from '../../components/articles/ArticleFilesTab'
import { ArticleHistoryTab, buildHistory } from '../../components/articles/ArticleHistoryTab'
import { Ic, Icon, TypeGlyph, type GlyphKind } from '../../components/articles/calc-icons'

const EMPTY_EST: ArticleEstimate = { marginPct: 35, nodes: [], updatedAt: '' }

const BLANK_META: ArticleMeta = {
  naam: '', relatieId: null, contactId: null, klant: '', tekening: '', rev: '',
  operations: [], currentStock: '', minStock: '', maxStock: '', locatie: '',
}

/** Stock status from live values. Accepts strings/'' because the API returns
 *  numeric fields as strings and the inline `meta` holds '' for a cleared field
 *  — coercing keeps a zero-stock article from slipping past `=== 0`. */
function statusFor(currentStock: number | string, minStock: number | string | null, maxStock: number | string | null) {
  const cur = Number(currentStock) || 0
  const min = minStock === '' || minStock == null ? null : Number(minStock)
  const max = maxStock === '' || maxStock == null ? null : Number(maxStock)
  if (cur === 0) return { label: 'Uit', cls: 'danger' }
  if (min != null && cur < min) return { label: 'Laag', cls: 'warn' }
  if (max != null && cur >= max * 0.85) return { label: 'Vol', cls: 'info' }
  return { label: 'Op voorraad', cls: 'ok' }
}

/** Map a profile's volume formula to the header type-tile glyph. */
function profileToGlyphKind(formula?: string): GlyphKind {
  switch (formula) {
    case 'round': return 'round'
    case 'square': return 'box'
    case 'flat': return 'plate'
    case 'tube': return 'tube'
    default: return 'box'
  }
}

type Tab = 'calculatie' | 'bestanden' | 'historie'

export function ArtikelDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? null
  const qc = useQueryClient()
  const isAdmin = useUserStore(s => s.user?.role === 'admin')
  const [tab, setTab] = useState<Tab>('calculatie')
  const [locModalOpen, setLocModalOpen] = useState(false)

  const { data: articles = [] }   = useQuery({ queryKey: ['articles'], queryFn: () => articlesApi.list() })
  const { data: gradesData }      = useQuery({ queryKey: ['grades'],   queryFn: gradesApi.list })
  const { data: profilesData }    = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const { data: machinesData }    = useQuery({ queryKey: ['machines'], queryFn: machinesApi.list })
  const { data: relatiesData }    = useQuery({ queryKey: ['relaties'], queryFn: relatiesApi.list })

  const article = articles.find(a => a.id === id) ?? null

  // Whole-article-page drop target: any drop anywhere on this page attaches the
  // file(s) — see useWholePageDrop for why that's a window listener.
  const attachmentUpload = useArticleAttachmentUpload(article)
  const dragging = useWholePageDrop(isAdmin && !!article, files => {
    attachmentUpload.uploadFiles(files)
    setTab('bestanden')
  })

  // ── Inline meta editing (no edit mode) — resync when the article id changes,
  //    otherwise treat local `meta` as the source of truth so a background
  //    refetch (triggered by our own debounced save) never clobbers typing. ──
  const [meta, setMetaState] = useState<ArticleMeta>(BLANK_META)
  const metaArticleId = useRef<string | null>(null)
  const metaDirty = useRef(false)
  useEffect(() => {
    if (article && metaArticleId.current !== article.id) {
      setMetaState(toArticleMeta(article))
      metaArticleId.current = article.id
      metaDirty.current = false
    }
  }, [article])
  const setMeta = (patch: Partial<ArticleMeta>) => {
    metaDirty.current = true
    setMetaState(m => ({ ...m, ...patch }))
  }

  // ── Estimate (calculator + margin) — same id-tracked, dirty-gated pattern ──
  const [est, setEst] = useState<ArticleEstimate>(EMPTY_EST)
  const estArticleId = useRef<string | null>(null)
  const estDirty = useRef(false)
  useEffect(() => {
    if (article && estArticleId.current !== article.id) {
      setEst(article.estimate ?? EMPTY_EST)
      estArticleId.current = article.id
      estDirty.current = false
    }
  }, [article])
  const changeEst: Dispatch<SetStateAction<ArticleEstimate>> = update => {
    estDirty.current = true
    setEst(update)
  }

  // Debounced persist of meta.
  useEffect(() => {
    if (!article || metaArticleId.current !== article.id || !metaDirty.current) return
    const t = setTimeout(() => saveMeta(article), 400)
    return () => clearTimeout(t)
  }, [meta]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced persist of the estimate (+ derived primary-material recipe).
  useEffect(() => {
    if (!article || estArticleId.current !== article.id || !estDirty.current) return
    const t = setTimeout(() => {
      const primaryMat = est.nodes.find(n =>
        n.type === 'material' && n.gradeId && n.profileId &&
        n.dimensions && Object.keys(n.dimensions).length > 0
      )
      const recipeUpdate = primaryMat ? {
        gradeId: primaryMat.gradeId!,
        profileId: primaryMat.profileId!,
        dimensions: primaryMat.dimensions as Record<string, number>,
        lengthPerPieceMm: primaryMat.lengthMm ?? 0,
      } : undefined

      articlesApi.update(article.id, {
        estimate: { ...est, updatedAt: new Date().toISOString() },
        ...(recipeUpdate ? { recipe: recipeUpdate } : {}),
      })
      qc.invalidateQueries({ queryKey: ['articles'] })
    }, 400)
    return () => clearTimeout(t)
  }, [est]) // eslint-disable-line react-hooks/exhaustive-deps

  function saveMeta(a: Article) {
    articlesApi.update(a.id, {
      naam: meta.naam.trim() || a.naam,
      relatieId: meta.relatieId,
      contactId: meta.contactId,
      klant: meta.klant.trim() || null,
      tekening: meta.tekening.trim() || null,
      rev: meta.rev.trim() || null,
      operations: meta.operations.map((tp, i) => ({ id: `op_${i}_${tp}`, type: tp })),
      currentStock: Number(meta.currentStock) || 0,
      minStock: meta.minStock === '' ? null : Number(meta.minStock),
      maxStock: meta.maxStock === '' ? null : Number(meta.maxStock),
      locatie: meta.locatie.trim() || null,
    })
    qc.invalidateQueries({ queryKey: ['articles'] })
  }

  const relatieOptions = (relatiesData?.data ?? [])
    .filter(r => r.type !== 'leverancier')
    .map(r => ({ value: r.id, label: r.naam }))

  if (!article) {
    return (
      <div className="ad-page">
        <div className="ad-crumb">
          <button className="ad-crumb-link" onClick={() => navigate(returnTo ?? '/artikelen')}>
            <Ic d={Icon.chevronRight} />{returnTo ? 'Offerte' : 'Artikelen'}
          </button>
        </div>
        <div className="st-empty" style={{ marginTop: 32 }}>Het artikel <strong>{id}</strong> bestaat niet (meer).</div>
      </div>
    )
  }

  const grades   = gradesData?.data   ?? []
  const profiles = profilesData?.data ?? []
  const machines = machinesData?.data ?? []
  const relatie  = (relatiesData?.data ?? []).find(r => r.id === meta.relatieId) ?? null

  const ctx = buildEstimateCtx(article, grades, profiles.map(p => ({ id: p.id, volumeFormula: p.volumeFormula })), machines)
  const totals = computeEstimateTotals(est, ctx)

  const activeProfile = profiles.find(p => p.id === article.recipe?.profileId)
  const historyEvents = buildHistory(article)
  const st = statusFor(meta.currentStock, meta.minStock, meta.maxStock)

  const metaLine = [
    article.id,
    meta.tekening ? `${meta.tekening}${meta.rev ? ` rev ${meta.rev}` : ''}` : null,
    meta.klant || null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="ad-page">
      {dragging && (
        <div className="art-page-drop-overlay">
          <div className="art-page-drop-hint">
            <IconUpload size={28} />
            <span>Zet bestand(en) neer om toe te voegen aan {article.naam}</span>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="ad-crumb">
        <button className="ad-crumb-link" onClick={() => navigate(returnTo ?? '/artikelen')}>
          <Ic d={Icon.chevronRight} />{returnTo ? 'Offerte' : 'Artikelen'}
        </button>
        <span className="ad-crumb-sep">/</span>
        <span className="ad-crumb-cur">{meta.naam || article.naam}</span>
      </div>

      {/* Title bar */}
      <div className="ad-titlebar">
        <div className="ad-glyph"><TypeGlyph kind={profileToGlyphKind(activeProfile?.volumeFormula)} size={30} /></div>
        <div className="ad-title-mid">
          <div className="ad-title-row">
            <h1 className="ad-h1">{meta.naam || article.naam}</h1>
            <span className={`badge ${st.cls}`}><span className="dot" />{st.label}</span>
          </div>
          <div className="ad-metaline">{metaLine}</div>
        </div>
        <div className="ad-title-actions">
          <button className="ad-btn primary" onClick={() => saveMeta(article)}><Ic d={Icon.check} size={14} />Opslaan</button>
        </div>
      </div>

      {/* 3-column header */}
      <div className="ad-grid">
        <ArticleInfoCard
          artikelNr={article.id}
          meta={meta}
          onChange={setMeta}
          relatieOptions={relatieOptions}
          relatie={relatie}
          onOpenLocation={() => setLocModalOpen(true)}
        />
        <ArticleFinancialCard
          est={est}
          ctx={ctx}
          totals={totals}
          onMarginChange={pct => changeEst(e => ({ ...e, marginPct: pct }))}
        />
        <ArticleFileViewer article={article} />
      </div>

      {/* Tabs */}
      <div className="ad-tabs">
        <button data-active={tab === 'calculatie'} onClick={() => setTab('calculatie')}>
          <Ic d={Icon.calc} />Calculatie
        </button>
        <button data-active={tab === 'bestanden'} onClick={() => setTab('bestanden')}>
          <Ic d={Icon.file} />Bestanden{article.attachments.length > 0 && <span className="tab-count">{article.attachments.length}</span>}
        </button>
        <button data-active={tab === 'historie'} onClick={() => setTab('historie')}>
          <Ic d={Icon.history} />Historie{historyEvents.length > 0 && <span className="tab-count">{historyEvents.length}</span>}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {tab === 'calculatie' && <ArticleCalculator article={article} est={est} onEstChange={changeEst} />}
        {tab === 'bestanden' && (
          <ArticleFilesTab
            article={article}
            uploading={attachmentUpload.uploading}
            uploadFiles={attachmentUpload.uploadFiles}
            removeAttachment={attachmentUpload.removeAttachment}
            setMachine={attachmentUpload.setMachine}
          />
        )}
        {tab === 'historie' && <ArticleHistoryTab events={historyEvents} />}
      </div>

      <LocationPickerModal
        opened={locModalOpen}
        onClose={() => setLocModalOpen(false)}
        currentLocationLabel={meta.locatie || null}
        onPick={label => setMeta({ locatie: label })}
      />
    </div>
  )
}
