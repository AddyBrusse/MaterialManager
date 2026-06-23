import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Modal, NumberInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconCheck } from '@tabler/icons-react'
import { articlesApi } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { relatiesApi } from '../../api/relaties'
import { buildEstimateCtx, computeEstimateTotals } from '../../api/estimate'
import { projectsApi, formatBedrag } from '../../api/projects'
import type { Article } from '../../api/articles'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StagedItem {
  artikelId: string
  naam: string
  tekening: string | null
  rev: string | null
  machines: string[]
  materiaal: string
  kostprijs: number
  qty: number
  marge: number
  verkoopprijs: number
}

interface Props {
  opened: boolean
  projectId: string
  offerteId: string
  relatieId: string | null
  onClose: () => void
  onAdded: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMachineNames(article: Article): string[] {
  if (!article.estimate) return []
  const seen = new Set<string>()
  return article.estimate.nodes
    .filter(n => n.type === 'machine' && n.name)
    .map(n => n.name)
    .filter(name => { if (seen.has(name)) return false; seen.add(name); return true })
}

// chain-link SVG — indicates marge ↔ verkoopprijs are coupled
const LinkIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ display: 'block' }}>
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
  </svg>
)

// ── Component ─────────────────────────────────────────────────────────────────

export function ArtikelPickerModal({ opened, projectId, offerteId, relatieId, onClose, onAdded }: Props) {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const articles  = articlesApi.list()
  const grades    = gradesApi.listSync()
  const profiles  = profilesApi.listSync()
  const machines  = machinesApi.listSync()
  const relaties  = relatiesApi.listSync()

  const [search, setSearch]               = useState('')
  const [filterRelatieId, setFilterRel]   = useState<string | null>(null)
  const [staged, setStaged]               = useState<StagedItem[]>([])

  useEffect(() => {
    if (!opened) return
    setStaged([])
    setSearch('')
    setFilterRel(relatieId)
  }, [opened, relatieId])

  // ── Compute cost from estimate ──────────────────────────────────────────────

  function getKostprijs(article: Article): number {
    if (!article.estimate) return 0
    try {
      const ctx = buildEstimateCtx(
        article,
        grades,
        profiles.map(p => ({ id: p.id, volumeFormula: p.volumeFormula })),
        machines,
      )
      return computeEstimateTotals(article.estimate, ctx).cost
    } catch { return 0 }
  }

  function getMateriaal(article: Article): string {
    if (!article.recipe) return '—'
    const p = profiles.find(pr => pr.id === article.recipe!.profileId)
    const g = grades.find(gr => gr.id === article.recipe!.gradeId)
    return [p?.name, g?.name].filter(Boolean).join(' · ') || '—'
  }

  // ── Staging mutations ───────────────────────────────────────────────────────

  function toggleArticle(article: Article) {
    const already = staged.some(s => s.artikelId === article.id)
    if (already) {
      setStaged(prev => prev.filter(s => s.artikelId !== article.id))
      return
    }
    const kostprijs = getKostprijs(article)
    const marge = Math.round(article.estimate?.marginPct ?? 20)
    const verkoopprijs = Math.round(kostprijs * (1 + marge / 100) * 100) / 100
    setStaged(prev => [...prev, {
      artikelId: article.id,
      naam: article.naam,
      tekening: article.tekening ?? null,
      rev: article.rev ?? null,
      machines: getMachineNames(article),
      materiaal: getMateriaal(article),
      kostprijs,
      qty: 1,
      marge,
      verkoopprijs,
    }])
  }

  function updateStaged(artikelId: string, field: 'qty' | 'marge' | 'verkoopprijs', raw: number | string) {
    const value = typeof raw === 'number' ? raw : parseFloat(String(raw))
    if (isNaN(value)) return
    setStaged(prev => prev.map(s => {
      if (s.artikelId !== artikelId) return s
      if (field === 'qty') return { ...s, qty: Math.max(1, Math.round(value)) }
      if (field === 'marge') {
        const marge = Math.round(value)
        const verkoopprijs = Math.round(s.kostprijs * (1 + marge / 100) * 100) / 100
        return { ...s, marge, verkoopprijs }
      }
      // verkoopprijs → back-compute marge (round to nearest integer)
      const marge = s.kostprijs > 0
        ? Math.round(((value / s.kostprijs) - 1) * 100)
        : 0
      return { ...s, verkoopprijs: value, marge }
    }))
  }

  // ── Filtered article list ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return articles.filter(a => {
      const matchQ = !q ||
        a.naam.toLowerCase().includes(q) ||
        (a.tekening ?? '').toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      const matchRel = !filterRelatieId || a.relatieId === filterRelatieId
      return matchQ && matchRel
    })
  }, [articles, search, filterRelatieId])

  const relatie     = relaties.find(r => r.id === filterRelatieId)
  const grandTotal  = staged.reduce((s, i) => s + Math.round(i.qty * i.verkoopprijs * 100) / 100, 0)
  const totalStuks  = staged.reduce((s, i) => s + i.qty, 0)

  // ── Submit ──────────────────────────────────────────────────────────────────

  function handleAdd() {
    if (staged.length === 0) return
    for (const item of staged) {
      projectsApi.addOfferteRegel(projectId, offerteId, {
        artikelId: item.artikelId,
        naam: item.naam,
        omschrijving: [item.tekening, item.rev ? `rev ${item.rev}` : ''].filter(Boolean).join(' '),
        qty: item.qty,
        eenheid: 'st.',
        verkoopprijs: item.verkoopprijs,
        bewerkingen: item.machines,
      })
    }
    notifications.show({
      color: 'green',
      message: `${staged.length} artikel${staged.length !== 1 ? 'en' : ''} · ${totalStuks} stuks toegevoegd aan ${offerteId}`,
    })
    onAdded()
    onClose()
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      padding={0}
      radius="md"
      size="calc(min(96vw, 1430px))"
      styles={{
        content: { height: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
        body:    { flex: 1, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },
      }}
      centered
    >
      {/* Header */}
      <div className="ap-hd">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M7 9h10M7 13h6M7 17h4" />
        </svg>
        <div>
          <div className="ap-hd-title">Artikelen toevoegen aan offerte</div>
          <div className="ap-hd-sub">{offerteId}</div>
        </div>
        <button className="st-icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>×</button>
      </div>

      {/* Filter bar */}
      <div className="ap-filter">
        <div className="st-search" style={{ flex: 1, minWidth: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            placeholder="Zoek artikel, tekening, ART-nr…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {filterRelatieId ? (
          <div className="st-chip active">
            {relatie?.naam ?? filterRelatieId}
            <span className="chip-x" style={{ cursor: 'pointer' }} onClick={() => setFilterRel(null)}>×</span>
          </div>
        ) : relatieId ? (
          <button className="st-btn ghost sm" onClick={() => setFilterRel(relatieId)}>+ Klantfilter</button>
        ) : null}
        <button className="st-btn primary sm" style={{ marginLeft: 'auto' }} onClick={() => {
          const blank = articlesApi.create({
            naam: 'Nieuw artikel', klant: null, relatieId: relatieId ?? null, contactId: null,
            tekening: null, rev: null, drawingPath: null, photoPath: null,
            recipe: null, operations: [], notes: { workholding: '', general: '' },
            attachments: [], estimate: null, locatie: null,
            currentStock: 0, minStock: null, maxStock: null,
          })
          qc.invalidateQueries({ queryKey: ['articles'] })
          onClose()
          navigate(`/artikelen/${blank.id}?returnTo=/projecten/${projectId}&offerteId=${offerteId}`)
        }}>
          <IconPlus size={13} />Nieuw artikel
        </button>
      </div>

      {/* Article list */}
      <div className="ap-list">
        <div className="st-table-wrap" style={{ margin: 0, flex: 1 }}>
          <div className="st-tbl-scroll">
            <table className="st-tbl">
              <thead>
                <tr>
                  <th className="col-checkbox" />
                  <th style={{ width: 78 }}>Art. No.</th>
                  <th>Omschrijving</th>
                  <th style={{ width: 110 }}>Tekeningnummer</th>
                  <th style={{ width: 52 }}>Revisie</th>
                  <th style={{ width: 130 }}>Bewerkingen</th>
                  <th style={{ width: 105 }}>Materiaal</th>
                  <th style={{ textAlign: 'right', width: 100 }}>Prijs</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--text-3)', fontStyle: 'italic' }}>
                      Geen artikelen gevonden
                    </td>
                  </tr>
                ) : filtered.map(article => {
                  const isStaged     = staged.some(s => s.artikelId === article.id)
                  const machineCh    = getMachineNames(article)
                  const kostprijs    = getKostprijs(article)
                  const verkoopprijs = article.estimate
                    ? Math.round(kostprijs * (1 + (article.estimate.marginPct ?? 20) / 100) * 100) / 100
                    : 0
                  return (
                    <tr key={article.id} data-selected={isStaged} onClick={() => toggleArticle(article)}>
                      <td className="col-checkbox">
                        <div className="st-ck" data-on={isStaged} />
                      </td>
                      <td className="cell-muted cell-mono" style={{ fontSize: 11.5 }}>{article.id}</td>
                      <td>
                        <div className="cell-strong">{article.naam || <span style={{ color: 'var(--text-4)', fontStyle: 'italic' }}>—</span>}</div>
                      </td>
                      <td className="cell-muted" style={{ fontSize: 11.5 }}>{article.tekening ?? '—'}</td>
                      <td className="cell-muted" style={{ fontSize: 11.5 }}>{article.rev ?? '—'}</td>
                      <td style={{ whiteSpace: 'normal' }}>
                        <div className="op-chips">
                          {machineCh.length > 0
                            ? machineCh.map(m => <span key={m} className="op-chip">{m}</span>)
                            : <span className="cell-muted" style={{ fontSize: 11.5 }}>—</span>}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'normal', fontSize: 12 }}>{getMateriaal(article)}</td>
                      <td>
                        <div className="cell-num cell-strong">
                          {verkoopprijs > 0 ? formatBedrag(verkoopprijs) : '—'}
                        </div>
                        {kostprijs > 0 && (
                          <div className="cell-muted cell-mono" style={{ fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                            kp {formatBedrag(kostprijs)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Staging card */}
      <div className="ap-staging">
        <div className="ap-staging-hd">
          <span className="title">Geselecteerd</span>
          {staged.length > 0
            ? <span className="badge">{staged.length} artikel{staged.length !== 1 ? 'en' : ''}</span>
            : <span style={{ fontSize: 12, color: 'var(--text-4)', fontWeight: 400, marginLeft: 4 }}>
                Vink artikelen aan in de lijst hierboven
              </span>}
        </div>
        {staged.length > 0 && (
          <div className="ap-staging-scroll">
            <table className="st-tbl" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: 78 }}>Art. No.</th>
                  <th style={{ width: 130 }}>Omschrijving</th>
                  <th style={{ width: 110 }}>Tekeningnummer</th>
                  <th style={{ width: 52 }}>Revisie</th>
                  <th style={{ width: 120 }}>Bewerkingen</th>
                  <th style={{ width: 100 }}>Materiaal</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Kostprijs</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Qty</th>
                  <th style={{ width: 84, textAlign: 'center' }}>Marge %</th>
                  <th style={{ width: 26 }} />
                  <th style={{ width: 112, textAlign: 'right' }}>Verkoopprijs</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Totaal</th>
                  <th style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {staged.map(item => (
                  <tr key={item.artikelId} style={{ cursor: 'default' }} onClick={e => e.stopPropagation()}>
                    <td className="cell-muted cell-mono" style={{ fontSize: 11.5 }}>{item.artikelId}</td>
                    <td className="cell-strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.naam}</td>
                    <td className="cell-muted" style={{ fontSize: 11.5 }}>{item.tekening ?? '—'}</td>
                    <td className="cell-muted" style={{ fontSize: 11.5 }}>{item.rev ?? '—'}</td>
                    <td style={{ whiteSpace: 'normal' }}>
                      <div className="op-chips">
                        {item.machines.length > 0
                          ? item.machines.map(m => <span key={m} className="op-chip">{m}</span>)
                          : <span className="cell-muted" style={{ fontSize: 11.5 }}>—</span>}
                      </div>
                    </td>
                    <td className="cell-muted" style={{ fontSize: 11.5 }}>{item.materiaal}</td>
                    <td className="cell-num cell-muted">
                      {item.kostprijs > 0 ? formatBedrag(item.kostprijs) : '—'}
                    </td>
                    <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                      <NumberInput
                        size="xs"
                        value={item.qty}
                        onChange={v => updateStaged(item.artikelId, 'qty', v)}
                        min={1} step={1} allowDecimal={false} allowNegative={false}
                        w={88}
                        styles={{ input: { textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: '11.5px', paddingRight: '19px' } }}
                      />
                    </td>
                    <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                      <NumberInput
                        size="xs"
                        value={item.marge}
                        onChange={v => updateStaged(item.artikelId, 'marge', v)}
                        min={0} step={1} allowDecimal={false} allowNegative={false}
                        w={72}
                        styles={{ input: { textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: '11.5px', paddingRight: '19px' } }}
                      />
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-3)', padding: '0 2px' }}>
                      <LinkIcon />
                    </td>
                    <td style={{ padding: '4px 4px', textAlign: 'right' }}>
                      <NumberInput
                        size="xs"
                        value={item.verkoopprijs}
                        onChange={v => updateStaged(item.artikelId, 'verkoopprijs', v)}
                        min={0} step={0.01} decimalScale={2} allowNegative={false}
                        w={100}
                        styles={{ input: { textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: '11.5px', paddingRight: '19px' } }}
                      />
                    </td>
                    <td className="cell-num cell-strong">
                      {formatBedrag(Math.round(item.qty * item.verkoopprijs * 100) / 100)}
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <button
                        className="st-icon-btn danger"
                        title="Verwijderen"
                        onClick={() => setStaged(prev => prev.filter(s => s.artikelId !== item.artikelId))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="ap-foot">
        <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
          {staged.length > 0 ? (
            <>
              {staged.length} artikel{staged.length !== 1 ? 'en' : ''} · {totalStuks} stuks · totaal{' '}
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                {formatBedrag(Math.round(grandTotal * 100) / 100)}
              </strong>{' '}
              excl. BTW
            </>
          ) : (
            <span style={{ color: 'var(--text-4)' }}>Geen artikelen geselecteerd</span>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <button className="st-btn ghost sm" onClick={onClose}>Annuleren</button>
        <button className="st-btn primary" onClick={handleAdd} disabled={staged.length === 0}>
          <IconCheck size={14} />Toevoegen aan offerte
        </button>
      </div>
    </Modal>
  )
}
