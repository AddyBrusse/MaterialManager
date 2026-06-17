import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconArrowLeft } from '@tabler/icons-react'
import { articlesApi, type Article, type ArticleEstimate } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { relatiesApi } from '../../api/relaties'
import { formatDimensions } from '../../api/raw-materials'
import { buildEstimateCtx, computeEstimateTotals } from '../../api/estimate'
import { useUserStore } from '../../stores/user'
import { ArticleCalculator } from '../../components/articles/ArticleCalculator'
import { ArticleInfoStrip, toArticleMeta, type ArticleMeta } from '../../components/articles/ArticleInfoStrip'
import { ArticleFilesTab } from '../../components/articles/ArticleFilesTab'
import { ArticleHistoryTab, buildHistory } from '../../components/articles/ArticleHistoryTab'
import { Ic, Icon, TypeGlyph, type GlyphKind } from '../../components/articles/calc-icons'

const EMPTY_EST: ArticleEstimate = { marginPct: 35, nodes: [], updatedAt: '' }

const BLANK_META: ArticleMeta = {
  naam: '', relatieId: null, contactId: null, klant: '', tekening: '', rev: '',
  operations: [], currentStock: '', minStock: '', maxStock: '', locatie: '',
}

function statusFor(a: Article) {
  if (a.currentStock === 0) return { label: 'Uit', cls: 'danger' }
  if (a.minStock != null && a.currentStock < a.minStock) return { label: 'Laag', cls: 'warn' }
  if (a.maxStock != null && a.currentStock >= a.maxStock * 0.85) return { label: 'Vol', cls: 'info' }
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
  const qc = useQueryClient()
  const isAdmin = useUserStore(s => s.user?.role === 'admin')
  const [tab, setTab] = useState<Tab>('calculatie')
  const [editMode, setEditMode] = useState(false)

  const { data: articles = [] }   = useQuery({ queryKey: ['articles'], queryFn: () => articlesApi.list() })
  const { data: gradesData }      = useQuery({ queryKey: ['grades'],   queryFn: gradesApi.list })
  const { data: profilesData }    = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const { data: machinesData }    = useQuery({ queryKey: ['machines'], queryFn: machinesApi.list })
  const { data: relatiesData }    = useQuery({ queryKey: ['relaties'], queryFn: relatiesApi.list })

  const article = articles.find(a => a.id === id) ?? null

  const [meta, setMetaState] = useState<ArticleMeta>(() => article ? toArticleMeta(article) : BLANK_META)
  useEffect(() => {
    if (!editMode && article) setMetaState(toArticleMeta(article))
  }, [article, editMode])

  const [est, setEst] = useState<ArticleEstimate>(EMPTY_EST)
  const estInited = useRef(false)
  useEffect(() => {
    if (!estInited.current && article) { setEst(article.estimate ?? EMPTY_EST); estInited.current = true }
  }, [article])

  useEffect(() => {
    if (!estInited.current || !article) return
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

  const relatieOptions = (relatiesData?.data ?? [])
    .filter(r => r.type !== 'leverancier')
    .map(r => ({ value: r.id, label: r.naam }))

  if (!article) {
    return (
      <>
        <div className="st-page-hd art-detail-hd">
          <div>
            <button className="st-btn ghost sm" onClick={() => navigate('/artikelen')}><IconArrowLeft size={14} />Artikelen</button>
            <div className="st-page-title" style={{ marginTop: 8 }}>Artikel niet gevonden</div>
          </div>
        </div>
        <div className="st-empty" style={{ marginTop: 32 }}>Het artikel <strong>{id}</strong> bestaat niet (meer).</div>
      </>
    )
  }

  const setMeta = (patch: Partial<ArticleMeta>) => setMetaState(m => ({ ...m, ...patch }))

  const grades   = gradesData?.data   ?? []
  const profiles = profilesData?.data ?? []
  const machines = machinesData?.data ?? []
  const relatie  = (relatiesData?.data ?? []).find(r => r.id === meta.relatieId) ?? null

  const ctx = buildEstimateCtx(article, grades, profiles.map(p => ({ id: p.id, volumeFormula: p.volumeFormula })), machines)
  const totals = computeEstimateTotals(est, ctx)

  const gradeName = grades.find(g => g.id === article.recipe?.gradeId)?.name ?? '—'
  const activeProfile = profiles.find(p => p.id === article.recipe?.profileId)
  const profileLabel = activeProfile && article.recipe
    ? `${activeProfile.name} ${formatDimensions(activeProfile, article.recipe.dimensions)}`.trim()
    : '—'

  const historyEvents = buildHistory(article)
  const st = statusFor(article)

  function startEdit() { setEditMode(true) }
  function cancelEdit() { setEditMode(false) }
  function saveEdit() {
    articlesApi.update(article!.id, {
      naam: meta.naam.trim() || article!.naam,
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
    setEditMode(false)
  }

  return (
    <>
      <div className="detail-head">
        <button className="detail-back" onClick={() => navigate('/artikelen')}><Ic d={Icon.chevronRight} />Artikelen</button>
        <div className="detail-top">
          <div className="detail-icon"><TypeGlyph kind={profileToGlyphKind(activeProfile?.volumeFormula)} size={26} /></div>
          <div className="detail-id">
            <div className="detail-name">
              {editMode
                ? <input className="info-primary-inp" style={{ maxWidth: 320 }} value={meta.naam} onChange={e => setMeta({ naam: e.target.value })} />
                : article.naam}
              <span className={`badge ${st.cls}`}><span className="dot" />{st.label}</span>
            </div>
            <div className="detail-meta">
              {article.id}
              {article.tekening ? ` · ${article.tekening}${article.rev ? ` rev ${article.rev}` : ''}` : ''}
              {article.klant ? ` · ${article.klant}` : ''}
            </div>
          </div>
          <div className="detail-actions">
            {editMode ? (
              <>
                <button className="btn" onClick={cancelEdit}>Annuleren</button>
                <button className="btn primary" onClick={saveEdit}><Ic d={Icon.check} size={14} />Opslaan</button>
              </>
            ) : (
              isAdmin && <button className="btn primary" onClick={startEdit}><Ic d={Icon.edit} size={14} />Bewerken</button>
            )}
          </div>
        </div>
      </div>

      <ArticleInfoStrip
        article={article}
        editMode={editMode}
        meta={meta}
        onChange={setMeta}
        relatieOptions={relatieOptions}
        relatie={relatie}
        gradeName={gradeName}
        profileLabel={profileLabel}
        totals={totals}
        onMarginChange={pct => setEst(e => ({ ...e, marginPct: pct }))}
        estUpdatedAt={article.estimate?.updatedAt ?? null}
      />

      <div className="detail-tabs">
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

      <div className="tab-body">
        {tab === 'calculatie' && <ArticleCalculator article={article} est={est} onEstChange={setEst} />}
        {tab === 'bestanden' && <ArticleFilesTab article={article} />}
        {tab === 'historie' && <ArticleHistoryTab events={historyEvents} />}
      </div>
    </>
  )
}
