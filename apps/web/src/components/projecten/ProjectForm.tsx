import { useState, useEffect } from 'react'
import { projectsApi } from '../../api/projects'
import { relatiesApi } from '../../api/relaties'
import type { Project, CreateProject } from '@stockmanager/shared'

interface Props {
  opened: boolean
  item?: Project
  onClose: () => void
  onSaved: () => void
}

export function ProjectForm({ opened, item, onClose, onSaved }: Props) {
  const relaties = relatiesApi.listSync()
  const klanten = relaties.filter(r => r.type !== 'leverancier')

  const [naam, setNaam]                 = useState('')
  const [relatieId, setRelatieId]       = useState<string>('')
  const [contactId, setContactId]       = useState<string>('')
  const [klantRef, setKlantRef]         = useState('')
  const [levertijdDatum, setLevertijd]  = useState('')
  const [notities, setNotities]         = useState('')

  const selectedRelatie = klanten.find(r => r.id === relatieId)

  useEffect(() => {
    if (item) {
      setNaam(item.naam)
      setRelatieId(item.relatieId ?? '')
      setContactId(item.contactId ?? '')
      setKlantRef(item.klantRef ?? '')
      setLevertijd(item.levertijdDatum ?? '')
      setNotities(item.notities)
    } else {
      setNaam(''); setRelatieId(''); setContactId('')
      setKlantRef(''); setLevertijd(''); setNotities('')
    }
  }, [item, opened])

  if (!opened) return null

  function handleSave() {
    if (!naam.trim()) return
    const body: CreateProject = {
      naam: naam.trim(),
      relatieId: relatieId || null,
      contactId: contactId || null,
      klantRef: klantRef.trim() || null,
      levertijdDatum: levertijdDatum || null,
      notities,
    }
    if (item) {
      projectsApi.update(item.id, body)
    } else {
      projectsApi.create(body)
    }
    onSaved()
  }

  return (
    <>
      <div className="st-drawer-scrim" onClick={onClose} />
      <div className="st-drawer">
        <div className="st-drawer-hd">
          <div className="ttl">{item ? 'Project bewerken' : 'Nieuw project'}</div>
          <button className="st-icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>×</button>
        </div>
        <div className="st-drawer-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="st-field">
            <label>Projectnaam *</label>
            <input
              className="st-input"
              placeholder="bijv. Roestvrijstalen beugels batch 3"
              value={naam}
              onChange={e => setNaam(e.target.value)}
              autoFocus
            />
          </div>

          <div className="st-field">
            <label>Klant</label>
            <select
              className="st-select"
              value={relatieId}
              onChange={e => { setRelatieId(e.target.value); setContactId('') }}
            >
              <option value="">— Geen klant geselecteerd —</option>
              {klanten.map(r => (
                <option key={r.id} value={r.id}>{r.naam}</option>
              ))}
            </select>
          </div>

          {selectedRelatie && selectedRelatie.contacten.length > 0 && (
            <div className="st-field">
              <label>Contactpersoon</label>
              <select
                className="st-select"
                value={contactId}
                onChange={e => setContactId(e.target.value)}
              >
                <option value="">— Geen contactpersoon —</option>
                {selectedRelatie.contacten.map(c => (
                  <option key={c.id} value={c.id}>{c.naam}{c.functie ? ` (${c.functie})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div className="st-grid-2">
            <div className="st-field">
              <label>Klant referentie</label>
              <input
                className="st-input"
                placeholder="bijv. PO-2026-441"
                value={klantRef}
                onChange={e => setKlantRef(e.target.value)}
              />
            </div>
            <div className="st-field">
              <label>Gewenste levertijddatum</label>
              <input
                className="st-input"
                type="date"
                value={levertijdDatum}
                onChange={e => setLevertijd(e.target.value)}
              />
            </div>
          </div>

          <div className="st-field">
            <label>Notities</label>
            <textarea
              className="st-input"
              placeholder="Interne projectnotities…"
              value={notities}
              onChange={e => setNotities(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <div className="st-drawer-ft">
          <button className="st-btn ghost" onClick={onClose}>Annuleren</button>
          <button className="st-btn primary" onClick={handleSave} disabled={!naam.trim()}>
            {item ? 'Opslaan' : 'Project aanmaken'}
          </button>
        </div>
      </div>
    </>
  )
}
