import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Switch, TextInput } from '@mantine/core'
import { IconArrowLeft, IconUsers, IconAlertTriangle, IconPackage, IconClock } from '@tabler/icons-react'
import { relatiesApi, type Relatie } from '../../api/relaties'
import { articlesApi } from '../../api/articles'
import { TypeBadge } from './RelatiesPage'
import { RelatieGegevensTab }  from '../../components/relaties/RelatieGegevensTab'
import { RelatieContactenTab } from '../../components/relaties/RelatieContactenTab'
import { RelatieArtikelenTab } from '../../components/relaties/RelatieArtikelenTab'

// ── inline-editable bedrijfsnaam in de header ─────────────────────────────────
function InlineNaam({ relatie }: { relatie: Relatie }) {
  const qc = useQueryClient()
  const [val, setVal] = useState(relatie.naam)
  const inited = useRef(false)

  useEffect(() => { setVal(relatie.naam) }, [relatie.naam])
  useEffect(() => { inited.current = true }, [])

  useEffect(() => {
    if (!inited.current) return
    const t = setTimeout(() => {
      if (!val.trim()) return
      relatiesApi.update(relatie.id, { naam: val.trim() })
        .then(() => qc.invalidateQueries({ queryKey: ['relaties'] }))
    }, 500)
    return () => clearTimeout(t)
  }, [val]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TextInput
      value={val}
      onChange={e => setVal(e.target.value)}
      placeholder="Bedrijfsnaam invullen…"
      styles={{
        input: {
          fontWeight: 600, fontSize: 19, letterSpacing: '-0.015em',
          border: 'none', background: 'transparent', padding: '0 4px',
          height: 'auto', lineHeight: 1.2,
          color: 'var(--text)',
        },
        wrapper: { flex: 1, maxWidth: 420 },
      }}
    />
  )
}

// ── tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'gegevens' | 'contacten' | 'artikelen'

// ── page ──────────────────────────────────────────────────────────────────────
export function RelatieDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: res, isLoading } = useQuery({
    queryKey: ['relaties', id],
    queryFn:  () => relatiesApi.get(id!),
    enabled:  !!id,
  })
  const relatie: Relatie | undefined = res?.data

  const [tab, setTab] = useState<Tab>('gegevens')

  // KPI data — synchronous reads from local stores
  const allArticles    = articlesApi.list()
  const linkedArticles = allArticles.filter(a => a.relatieId === id)
  const laagOpVoorraad = linkedArticles.filter(
    a => a.currentStock === 0 || (a.minStock != null && a.currentStock < a.minStock)
  ).length

  function toggleActief() {
    if (!relatie) return
    relatiesApi.update(relatie.id, { actief: !relatie.actief })
      .then(() => qc.invalidateQueries({ queryKey: ['relaties', id] }))
  }

  if (isLoading) {
    return <div className="st-empty">Laden…</div>
  }

  if (!relatie) {
    return (
      <>
        <div className="st-page-hd">
          <div>
            <button className="st-btn ghost sm" onClick={() => navigate('/relaties')}>
              <IconArrowLeft size={14} />Relaties
            </button>
            <div className="st-page-title" style={{ marginTop: 8 }}>Relatie niet gevonden</div>
          </div>
        </div>
        <div className="st-empty">De relatie <strong>{id}</strong> bestaat niet (meer).</div>
      </>
    )
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="st-page-hd art-detail-hd">
        <div style={{ minWidth: 0, flex: 1 }}>
          <button className="st-btn ghost sm" onClick={() => navigate('/relaties')}>
            <IconArrowLeft size={14} />Relaties
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <InlineNaam relatie={relatie} />
            <TypeBadge type={relatie.type} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            {relatie.actief ? 'Actief' : 'Inactief'}
          </span>
          <Switch size="xs" checked={relatie.actief} onChange={toggleActief} />
        </div>
      </div>

      {/* ── KPI strip — uses same st-stats / st-stat classes as VoorraadPage ── */}
      <div className="st-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="st-stat">
          <div className="st-stat-lbl"><IconPackage size={13} />Artikelen</div>
          <div className="st-stat-val">{linkedArticles.length}</div>
          <div className="st-stat-foot">
            <span>{linkedArticles.length === 1 ? 'artikel' : 'artikelen'} gekoppeld</span>
          </div>
        </div>

        <div className="st-stat">
          <div className="st-stat-lbl" style={laagOpVoorraad > 0 ? { color: 'var(--danger)' } : undefined}>
            <IconAlertTriangle size={13} />Laag / geen voorraad
          </div>
          <div className="st-stat-val" style={laagOpVoorraad > 0 ? { color: 'var(--danger)' } : undefined}>
            {laagOpVoorraad}
          </div>
          <div className="st-stat-foot">
            <span>{laagOpVoorraad > 0 ? 'actie vereist' : 'alles op peil'}</span>
          </div>
        </div>

        <div className="st-stat">
          <div className="st-stat-lbl"><IconClock size={13} />Betalingstermijn</div>
          <div className="st-stat-val">
            {relatie.betalingstermijn ?? '—'}
            {relatie.betalingstermijn != null && <span className="unit"> dgn</span>}
          </div>
          <div className="st-stat-foot">
            <span>{relatie.betalingstermijn != null ? 'netto betalen' : 'niet ingesteld'}</span>
          </div>
        </div>

        <div className="st-stat">
          <div className="st-stat-lbl"><IconUsers size={13} />Contactpersonen</div>
          <div className="st-stat-val">{relatie.contacten.length}</div>
          <div className="st-stat-foot">
            <span>{relatie.contacten.length === 1 ? 'persoon' : 'personen'}</span>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="st-tabs">
        <button className={`st-tab-btn${tab === 'gegevens'  ? ' active' : ''}`} onClick={() => setTab('gegevens')}>
          Bedrijfsgegevens
        </button>
        <button className={`st-tab-btn${tab === 'contacten' ? ' active' : ''}`} onClick={() => setTab('contacten')}>
          Contactpersonen
          {relatie.contacten.length > 0 && (
            <span style={{ marginLeft: 5, opacity: 0.55, fontSize: 11 }}>({relatie.contacten.length})</span>
          )}
        </button>
        <button className={`st-tab-btn${tab === 'artikelen' ? ' active' : ''}`} onClick={() => setTab('artikelen')}>
          Artikelen
          {linkedArticles.length > 0 && (
            <span style={{ marginLeft: 5, opacity: 0.55, fontSize: 11 }}>({linkedArticles.length})</span>
          )}
        </button>
      </div>

      <div className="st-tab-content" style={{ padding: '20px 24px 40px', overflowY: 'auto', flex: 1 }}>
        {tab === 'gegevens'  && <RelatieGegevensTab  relatie={relatie} />}
        {tab === 'contacten' && <RelatieContactenTab relatie={relatie} />}
        {tab === 'artikelen' && <RelatieArtikelenTab relatieId={relatie.id} />}
      </div>
    </>
  )
}
