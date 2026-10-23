import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { IconUpload, IconExternalLink } from '@tabler/icons-react'
import { pageTabs } from '../../utils/pageTabs'
import { usePopoutRoutes } from '../../hooks/usePopout'
import { focusPopout, requestClosePopout } from '../../utils/popout'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { relatiesApi } from '../../api/relaties'
import { buildEstimateCtx, computeEstimateTotals } from '../../api/estimate'
import { useUserStore } from '../../stores/user'
import { useEditLock } from '../../hooks/useEditLock'
import { useArtikelBewerken } from '../../hooks/useArtikelBewerken'
import { useArticleAttachmentUpload } from '../../hooks/useArticleAttachmentUpload'
import { useWholePageDrop } from '../../hooks/useWholePageDrop'
import { ArticleCalculator } from '../../components/articles/ArticleCalculator'
import { ArticleInfoCard } from '../../components/articles/ArticleInfoStrip'
import { ArticleFinancialCard } from '../../components/articles/ArticleFinancialCard'
import { ArticleFileViewer } from '../../components/articles/ArticleFileViewer'
import { LocationPickerModal } from '../../components/articles/LocationPickerModal'
import { ArticleFilesTab } from '../../components/articles/ArticleFilesTab'
import { ArticleHistoryTab, buildHistory } from '../../components/articles/ArticleHistoryTab'
import { ArticlePrijshistorieTab } from '../../components/articles/ArticlePrijshistorieTab'
import { ArtikelNacalculatieTab } from '../../components/nacalculatie/ArtikelNacalculatieTab'
import { ArtikelStand, zegWaaromDicht } from '../../components/articles/ArtikelStand'
import { ArtikelTabs, type ArtikelTab } from '../../components/articles/ArtikelTabs'
import { Ic, Icon, TypeGlyph, type GlyphKind } from '../../components/articles/calc-icons'

/**
 * Voorraadstand voor de badge in de titel. Getallen kunnen als tekst binnenkomen
 * (de API geeft decimalen als string, een leeg veld is ''), vandaar de omzetting.
 *
 * Rood "Uit" alleen als er een minimumvoorraad is (2026-10-23): een artikel dat
 * op bestelling gemaakt wordt staat bijna altijd op 0, en dat is dan geen alarm.
 */
export function statusFor(currentStock: number | string, minStock: number | string | null, maxStock: number | string | null) {
  const cur = Number(currentStock) || 0
  const min = minStock === '' || minStock == null ? null : Number(minStock)
  const max = maxStock === '' || maxStock == null ? null : Number(maxStock)
  if (cur === 0) return min == null ? { label: 'Geen voorraad', cls: '' } : { label: 'Uit', cls: 'danger' }
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

export function ArtikelDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? null
  const isAdmin = useUserStore(s => s.user?.role === 'admin')
  const [tab, setTab] = useState<ArtikelTab>('calculatie')
  const [locModalOpen, setLocModalOpen] = useState(false)

  const { data: gradesData }   = useQuery({ queryKey: ['grades'],   queryFn: gradesApi.list })
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const { data: machinesData } = useQuery({ queryKey: ['machines'], queryFn: machinesApi.list })
  const { data: relatiesData } = useQuery({ queryKey: ['relaties'], queryFn: relatiesApi.list })

  const poppedOut = usePopoutRoutes()
  // This component also renders inside the detached popout window; only the MAIN
  // window swaps in the "open elsewhere" placeholder.
  const inPopoutWindow = window.location.pathname.startsWith('/pop/')
  const isPoppedOut    = !inPopoutWindow && poppedOut.has(`/artikelen/${id}`)

  // Wie het artikel open heeft mag bewerken; wie daarna komt kijkt mee (2026-10-23).
  const slot = useEditLock('article', id, !isPoppedOut)
  const { article, laden, kopie, kanBewerken, meta, setMeta, est, changeEst, opslag, opgeslagenOm, opnieuwOpslaan } =
    useArtikelBewerken(id, slot.isHolder)
  const alleenLezen = !kanBewerken
  const waaromDicht = zegWaaromDicht(slot, kopie)

  // Whole-article-page drop target: any drop anywhere on this page attaches the
  // file(s) — see useWholePageDrop for why that's a window listener.
  const attachmentUpload = useArticleAttachmentUpload(article)
  const dragging = useWholePageDrop(isAdmin && !!article && !alleenLezen, files => {
    attachmentUpload.uploadFiles(files)
    setTab('bestanden')
  })

  // Register (and keep labelled) an open-articles tab for whatever article is
  // on screen — covers every entry point (list click, direct URL, offerte link).
  useEffect(() => {
    if (article) pageTabs.open(`/artikelen/${article.id}`, meta.naam.trim() || article.naam)
  }, [article?.id, meta.naam]) // eslint-disable-line react-hooks/exhaustive-deps

  const relatieOptions = (relatiesData?.data ?? [])
    .filter(r => r.type !== 'leverancier')
    .map(r => ({ value: r.id, label: r.naam }))

  if (!article) {
    return (
      <div className="ad-page">
        {returnTo && (
          <div className="ad-crumb">
            <button className="ad-crumb-link" onClick={() => navigate(returnTo)}>
              <Ic d={Icon.chevronRight} />Offerte
            </button>
          </div>
        )}
        <div className="st-empty" style={{ marginTop: 32 }}>
          {laden ? 'Artikel laden…' : <>Het artikel <strong>{id}</strong> bestaat niet (meer).</>}
        </div>
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

  // Article is open in its own detached window — show a placeholder here rather
  // than a second live copy (mirrors the projecten page / AppLayout PopoutAware).
  if (isPoppedOut) {
    return (
      <div className="st-popout-placeholder">
        <div className="ic"><IconExternalLink size={22} /></div>
        <div className="t">{meta.naam || article.naam} is open in een apart venster</div>
        <div className="d">Gebruik dat venster, of haal het artikel terug naar het hoofdvenster.</div>
        <div className="actions">
          <button className="btn" onClick={() => focusPopout(`/artikelen/${id}`)}>Venster tonen</button>
          <button className="btn primary" onClick={() => requestClosePopout(`/artikelen/${id}`)}>Sluit venster, toon hier</button>
        </div>
      </div>
    )
  }

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

      {/* Breadcrumb — only when returning to an offerte; otherwise the tab strip's
          "Artikelen" home covers list navigation. */}
      {returnTo && (
        <div className="ad-crumb">
          <button className="ad-crumb-link" onClick={() => navigate(returnTo)}>
            <Ic d={Icon.chevronRight} />Offerte
          </button>
          <span className="ad-crumb-sep">/</span>
          <span className="ad-crumb-cur">{meta.naam || article.naam}</span>
        </div>
      )}

      {/* Title bar */}
      <div className="ad-titlebar">
        <div className="ad-glyph"><TypeGlyph kind={profileToGlyphKind(activeProfile?.volumeFormula)} size={30} /></div>
        <div className="ad-title-mid">
          <div className="ad-title-row">
            <h1 className="ad-h1">{meta.naam || article.naam}</h1>
            <span className={`badge ${st.cls}`}><span className="dot" />{st.label}</span>
            {/* Links bij de titel, niet rechtsboven: daar komen de meldingen, en
                een foutmelding lag dan precies over "Opnieuw opslaan". */}
            <ArtikelStand slot={slot} opslag={opslag} opgeslagenOm={opgeslagenOm} kopie={kopie} onOpnieuw={opnieuwOpslaan} />
          </div>
          <div className="ad-metaline">{metaLine}</div>
        </div>
      </div>

      {/* 3-column header; de twee kaarten om te bewerken staan dicht als je meekijkt */}
      <div className="ad-grid">
        <fieldset className="ad-slot" disabled={alleenLezen} onPointerDown={waaromDicht}>
          <ArticleInfoCard
            artikelNr={article.id}
            meta={meta}
            onChange={setMeta}
            relatieOptions={relatieOptions}
            relatie={relatie}
            onOpenLocation={() => setLocModalOpen(true)}
          />
        </fieldset>
        <fieldset className="ad-slot" disabled={alleenLezen} onPointerDown={waaromDicht}>
          <ArticleFinancialCard
            est={est}
            ctx={ctx}
            totals={totals}
            onMarginChange={pct => changeEst(e => ({ ...e, marginPct: pct }))}
          />
        </fieldset>
        <ArticleFileViewer article={article} />
      </div>

      <ArtikelTabs actief={tab} onKies={setTab}
        aantallen={{ bestanden: article.attachments.length, historie: historyEvents.length }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {tab === 'calculatie' && (
          <fieldset className="ad-slot" disabled={alleenLezen} onPointerDown={waaromDicht}>
            <ArticleCalculator article={article} est={est} onEstChange={changeEst} readOnly={alleenLezen} />
          </fieldset>
        )}
        {tab === 'bestanden' && (
          <fieldset className="ad-slot" disabled={alleenLezen} onPointerDown={waaromDicht}>
            <ArticleFilesTab
              article={article}
              uploading={attachmentUpload.uploading}
              uploadFiles={attachmentUpload.uploadFiles}
              removeAttachment={attachmentUpload.removeAttachment}
              setMachine={attachmentUpload.setMachine}
            />
          </fieldset>
        )}
        {tab === 'nacalculatie' && (
          <fieldset className="ad-slot" disabled={alleenLezen} onPointerDown={waaromDicht}>
            <ArtikelNacalculatieTab artikelId={article.id} />
          </fieldset>
        )}
        {tab === 'prijshistorie' && <ArticlePrijshistorieTab articleId={article.id} />}
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
