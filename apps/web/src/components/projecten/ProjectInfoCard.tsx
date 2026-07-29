import { useEffect, useState } from 'react'
import { Autocomplete } from '@mantine/core'
import type { Relatie } from '../../api/relaties'
import type { Project } from '@stockmanager/shared'
import { Ic, Icon } from '../articles/calc-icons'

export interface ProjectMeta {
  naam: string
  relatieId: string | null
  contactId: string | null
  klantRef: string
  levertijdDatum: string
}

export function toProjectMeta(p: Project): ProjectMeta {
  return {
    naam: p.naam,
    relatieId: p.relatieId,
    contactId: p.contactId,
    klantRef: p.klantRef ?? '',
    levertijdDatum: p.levertijdDatum ?? '',
  }
}

/**
 * Col 1 of the project-detail header: the always-inline "Klant" card.
 * Ported from the article-detail redesign (ArticleInfoCard) — no edit mode,
 * every field writes straight to `meta` via `onChange` and the page debounces
 * the persist. Klant/Contact are searchable Mantine Autocompletes; the project
 * stores only `relatieId`, so the Klant free-text lives in local state and
 * resolves to a relatie on an exact match.
 */
export function ProjectInfoCard({
  meta, onChange, relatieOptions, relatie,
}: {
  meta: ProjectMeta
  onChange: (patch: Partial<ProjectMeta>) => void
  relatieOptions: { value: string; label: string }[]
  relatie: Relatie | null
}) {
  const contacten = relatie?.contacten ?? []
  const contact = contacten.find(c => c.id === meta.contactId) ?? contacten[0]
  const contactLabel = (c: { naam: string; functie?: string | null }) =>
    c.functie ? `${c.naam} (${c.functie})` : c.naam
  const setContact = (v: string) => {
    const match = contacten.find(c => contactLabel(c) === v) ?? contacten.find(c => c.naam === v)
    onChange({ contactId: match?.id ?? null })
  }

  // Changing Klant auto-selects that customer's first contact — persist the
  // fallback so a contact the user never clicks still gets stored.
  useEffect(() => {
    if (contacten.length > 0 && !contacten.some(c => c.id === meta.contactId)) {
      onChange({ contactId: contacten[0].id })
    }
  }, [relatie?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The project only persists relatieId, so the Klant autocomplete's free text
  // is local — seeded from the selected relatie, resolved back to an id on an
  // exact match (cleared when emptied).
  const [klantText, setKlantText] = useState(relatie?.naam ?? '')
  useEffect(() => { setKlantText(relatie?.naam ?? '') }, [relatie?.id])
  const setKlant = (v: string) => {
    setKlantText(v)
    const match = relatieOptions.find(o => o.label.toLowerCase() === v.trim().toLowerCase())
    if (match) onChange({ relatieId: match.value, contactId: null })
    else if (v.trim() === '') onChange({ relatieId: null, contactId: null })
  }

  return (
    <div className="ad-card">
      <div className="ad-eyebrow"><Ic d={Icon.user} />Klant</div>
      <div className="ad-fields">
        <div className="ad-fieldrow">
          <label className="ad-fieldlabel">Naam</label>
          <input className="field-inp strong" placeholder="Projectnaam…"
            value={meta.naam} onChange={e => onChange({ naam: e.target.value })} />
        </div>
        <div className="ad-fieldrow">
          <label className="ad-fieldlabel">Klant</label>
          <Autocomplete
            className="ad-ac" size="xs" placeholder="Kies klant" maxDropdownHeight={220}
            data={relatieOptions.map(o => o.label)}
            value={klantText}
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
          <label className="ad-fieldlabel">Ref. klant</label>
          <input className="field-inp" placeholder="—"
            value={meta.klantRef} onChange={e => onChange({ klantRef: e.target.value })} />
        </div>
        <div className="ad-fieldrow">
          <label className="ad-fieldlabel">Levertijd</label>
          <input className="field-inp" type="date"
            value={meta.levertijdDatum} onChange={e => onChange({ levertijdDatum: e.target.value })} />
        </div>
      </div>
    </div>
  )
}
