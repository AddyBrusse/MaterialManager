import { useEffect, useState } from 'react'
import { Autocomplete } from '@mantine/core'
import type { Article } from '../../api/articles'
import type { Relatie } from '../../api/relaties'
import { Ic, Icon } from './calc-icons'

export interface ArticleMeta {
  naam: string
  relatieId: string | null
  contactId: string | null
  klant: string
  tekening: string
  rev: string
  operations: string[]
  currentStock: number | ''
  minStock: number | ''
  maxStock: number | ''
  locatie: string
}

export function toArticleMeta(a: Article): ArticleMeta {
  return {
    naam: a.naam,
    relatieId: a.relatieId,
    contactId: a.contactId,
    klant: a.klant ?? '',
    tekening: a.tekening ?? '',
    rev: a.rev ?? '',
    operations: a.operations.map(o => o.type),
    currentStock: a.currentStock,
    minStock: a.minStock ?? '',
    maxStock: a.maxStock ?? '',
    locatie: a.locatie ?? '',
  }
}

/**
 * Col 1 of the article-detail header: "Artikel & Klant" + "Voorraad".
 * Always-inline (no edit mode) — every field writes straight to `meta` via
 * `onChange`; the page debounces the persist. Klant is a searchable datalist
 * (todo #1). Location opens a picker when `onOpenLocation` is supplied,
 * otherwise falls back to an inline text field.
 */
export function ArticleInfoCard({
  artikelNr, meta, onChange, relatieOptions, relatie, onOpenLocation,
}: {
  artikelNr: string
  meta: ArticleMeta
  onChange: (patch: Partial<ArticleMeta>) => void
  relatieOptions: { value: string; label: string }[]
  relatie: Relatie | null
  onOpenLocation?: () => void
}) {
  const [editingLoc, setEditingLoc] = useState(false)
  const contacten = relatie?.contacten ?? []
  const contact = contacten.find(c => c.id === meta.contactId) ?? contacten[0]
  const contactLabel = (c: { naam: string; functie?: string | null }) =>
    c.functie ? `${c.naam} (${c.functie})` : c.naam
  const setContact = (v: string) => {
    const match = contacten.find(c => contactLabel(c) === v) ?? contacten.find(c => c.naam === v)
    onChange({ contactId: match?.id ?? null })
  }

  // The Contact <select> falls back to showing the first contact when
  // contactId is null, but a fallback the user never clicks never fires
  // onChange — so persist it. Whenever the selected customer's contacts don't
  // include the stored contactId, snap it to the first (matching the spec:
  // "changing Klant auto-selects that customer's first contact").
  useEffect(() => {
    if (contacten.length > 0 && !contacten.some(c => c.id === meta.contactId)) {
      onChange({ contactId: contacten[0].id })
    }
  }, [relatie?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const cur = Number(meta.currentStock) || 0
  const max = Number(meta.maxStock) || 0
  const stockPct = max > 0 ? Math.min(100, (cur / max) * 100) : (cur > 0 ? 100 : 0)

  const setKlant = (v: string) => {
    const match = relatieOptions.find(o => o.label.toLowerCase() === v.trim().toLowerCase())
    onChange({ relatieId: match?.value ?? null, klant: v, contactId: null })
  }

  const num = (v: string): number | '' => (v === '' ? '' : Number(v))

  return (
    <div className="ad-card">
      {/* ── Artikelnummer — quick-glance identity above the fields ── */}
      <div className="ad-artno">{artikelNr}</div>

      {/* ── Artikel & Klant ── */}
      <div className="ad-eyebrow"><Ic d={Icon.layers} />Artikel &amp; Klant</div>
      <div className="ad-fields">
        <div className="ad-fieldrow">
          <label className="ad-fieldlabel">Klant</label>
          <Autocomplete
            className="ad-ac" size="xs" placeholder="Kies klant" maxDropdownHeight={220}
            data={relatieOptions.map(o => o.label)}
            value={meta.klant}
            onChange={setKlant}
          />
        </div>
        <div className="ad-fieldrow">
          <label className="ad-fieldlabel">Contact</label>
          <Autocomplete
            className="ad-ac" size="xs" placeholder="Kies contact" maxDropdownHeight={220}
            disabled={contacten.length === 0}
            data={contacten.map(contactLabel)}
            value={contact ? contactLabel(contact) : ''}
            onChange={setContact}
          />
        </div>
        <div className="ad-fieldrow">
          <label className="ad-fieldlabel">Omschrijving</label>
          <input className="field-inp strong" value={meta.naam} onChange={e => onChange({ naam: e.target.value })} />
        </div>
        <div className="ad-fieldrow">
          <label className="ad-fieldlabel">Tekening no. — Rev</label>
          <div className="ad-rev">
            <input className="field-inp mono" value={meta.tekening} onChange={e => onChange({ tekening: e.target.value })} />
            <span className="ad-rev-sep">rev</span>
            <input className="field-inp mono strong ad-rev-inp" value={meta.rev} onChange={e => onChange({ rev: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="ad-divider" />

      {/* ── Voorraad ── */}
      <div className="ad-eyebrow"><Ic d={Icon.pkg} />Voorraad</div>
      <div className="ad-stat3">
        <div className="ad-stat">
          <span className="ad-stat-label">Op voorraad</span>
          <div className="ad-statbox disabled">
            <input type="number" value={meta.currentStock} disabled readOnly />
            <span className="ad-stat-unit">st</span>
          </div>
        </div>
        <div className="ad-stat">
          <span className="ad-stat-label">Min</span>
          <div className="ad-statbox">
            <input type="number" min={0} value={meta.minStock} onChange={e => onChange({ minStock: num(e.target.value) })} />
            <span className="ad-stat-unit">st</span>
          </div>
        </div>
        <div className="ad-stat">
          <span className="ad-stat-label">Max</span>
          <div className="ad-statbox">
            <input type="number" min={0} value={meta.maxStock} onChange={e => onChange({ maxStock: num(e.target.value) })} />
            <span className="ad-stat-unit">st</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="ad-progress"><div className="ad-progress-fill" style={{ width: `${stockPct}%` }} /></div>
        <div className="ad-freerow"><span>Gereserveerd 0</span><span>Vrij {cur}</span></div>
      </div>

      {editingLoc && !onOpenLocation ? (
        <input className="field-inp mono" autoFocus value={meta.locatie}
          onChange={e => onChange({ locatie: e.target.value })}
          onBlur={() => setEditingLoc(false)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingLoc(false) }} />
      ) : (
        <button className="ad-locbtn" onClick={() => (onOpenLocation ? onOpenLocation() : setEditingLoc(true))}>
          <Ic d={Icon.pin} />
          <span className="code">{meta.locatie || '—'}</span>
          <span className="desc" />
          <Ic d={Icon.chevronDown} />
        </button>
      )}
    </div>
  )
}
