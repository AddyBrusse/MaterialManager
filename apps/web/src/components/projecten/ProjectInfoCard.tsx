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
 * De gegevensregel van een project: klant, contact, referentie en leverdatum.
 *
 * Eén horizontale regel, geen kaart met gestapelde velden. De kaartvorm kwam
 * uit de tijd dat hier vier kaarten naast elkaar stonden; die zijn weg omdat ze
 * hetzelfde zeiden als de matrix eronder. Wat overblijft zijn de velden die je
 * hier invult en nergens anders, en die passen naast elkaar — dat scheelt bijna
 * honderd pixels hoogte, precies wat de artikelenlijst nodig heeft.
 *
 * Geen bewerkmodus: elk veld schrijft direct naar `meta` en de pagina bewaart
 * met vertraging. Klant en contact zijn zoekvelden; het project bewaart alleen
 * `relatieId`, dus de vrije tekst staat lokaal en lost pas op bij een exacte
 * treffer.
 */
export function ProjectInfoCard({
  meta, onChange, relatieOptions, relatie, readOnly = false,
}: {
  meta: ProjectMeta
  onChange: (patch: Partial<ProjectMeta>) => void
  relatieOptions: { value: string; label: string }[]
  relatie: Relatie | null
  readOnly?: boolean
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
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '9px 14px', marginBottom: 12,
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.05em', color: 'var(--text-3)', whiteSpace: 'nowrap',
      }}>
        Projectgegevens
      </span>

      <Veld label="Naam" breed={220}>
        <input className="field-inp strong" placeholder="Projectnaam…" disabled={readOnly}
          value={meta.naam} onChange={e => onChange({ naam: e.target.value })} />
      </Veld>
      <Veld label="Klant" breed={170}>
        <Autocomplete
          className="ad-ac" size="xs" placeholder="Kies klant" maxDropdownHeight={220}
          disabled={readOnly}
          data={relatieOptions.map(o => o.label)}
          value={klantText}
          onChange={setKlant}
        />
      </Veld>
      <Veld label="Contact" breed={160}>
        <Autocomplete
          className="ad-ac" size="xs" placeholder="Kies contact" maxDropdownHeight={220}
          disabled={readOnly || contacten.length === 0}
          data={contacten.map(contactLabel)}
          value={contact ? contactLabel(contact) : ''}
          onChange={setContact}
        />
      </Veld>
      <Veld label="Ref. klant" breed={110}>
        <input className="field-inp" placeholder="—" disabled={readOnly}
          value={meta.klantRef} onChange={e => onChange({ klantRef: e.target.value })} />
      </Veld>
      <Veld label="Levering" breed={140}>
        <input className="field-inp" type="date" disabled={readOnly}
          value={meta.levertijdDatum} onChange={e => onChange({ levertijdDatum: e.target.value })} />
      </Veld>

      <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>
        wordt vanzelf opgeslagen
      </span>
    </div>
  )
}

/** Label en veld naast elkaar. Het label buiten het invoervak houdt de regel
 *  laag — een label erboven kost een tweede regel voor elk veld. */
function Veld({ label, breed, children }: {
  label: string
  breed: number
  children: React.ReactNode
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ width: breed }}>{children}</span>
    </span>
  )
}
