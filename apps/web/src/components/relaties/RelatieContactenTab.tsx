import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { relatiesApi, type Relatie, type RelatieContact } from '../../api/relaties'

export function RelatieContactenTab({ relatie }: { relatie: Relatie }) {
  const qc = useQueryClient()
  const [contacts, setContacts] = useState<RelatieContact[]>(relatie.contacten)
  const inited = useRef(false)

  // Reset when relatie changes (e.g. navigating between detail pages)
  useEffect(() => { inited.current = false; setContacts(relatie.contacten) }, [relatie.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { inited.current = true }, [])

  // Debounced auto-save
  useEffect(() => {
    if (!inited.current) return
    const t = setTimeout(() => {
      relatiesApi.update(relatie.id, { contacten: contacts }).then(() => {
        qc.invalidateQueries({ queryKey: ['relaties', relatie.id] })
        qc.invalidateQueries({ queryKey: ['relaties'] })
      })
    }, 400)
    return () => clearTimeout(t)
  }, [contacts]) // eslint-disable-line react-hooks/exhaustive-deps

  function update(id: string, patch: Partial<RelatieContact>) {
    setContacts(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  function addRow() {
    setContacts(cs => [...cs, {
      id: `c${Date.now()}`, naam: '', functie: null, telefoon: null, mobiel: null, email: null,
    }])
  }

  function removeRow(id: string) {
    setContacts(cs => cs.filter(c => c.id !== id))
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Contactpersonen</div>
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>{contacts.length} contact{contacts.length !== 1 ? 'en' : ''}</div>
        </div>
        <button className="st-btn primary sm" style={{ marginLeft: 'auto' }} onClick={addRow}>
          <IconPlus size={12} /> Toevoegen
        </button>
      </div>

      {contacts.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-4)', padding: '32px 0', fontSize: 13 }}>
          Nog geen contactpersonen. Klik op "+ Toevoegen" om er een toe te voegen.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
          <table className="st-tbl">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Functie</th>
                <th>Telefoon</th>
                <th>Mobiel</th>
                <th>E-mail</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id}>
                  <td>
                    <input className="st-input" style={{ width: '100%' }} placeholder="Naam…"
                      value={c.naam} onChange={e => update(c.id, { naam: e.target.value })} />
                  </td>
                  <td>
                    <input className="st-input" style={{ width: '100%' }} placeholder="—"
                      value={c.functie ?? ''} onChange={e => update(c.id, { functie: e.target.value || null })} />
                  </td>
                  <td>
                    <input className="st-input cell-mono" style={{ width: '100%' }} placeholder="—"
                      value={c.telefoon ?? ''} onChange={e => update(c.id, { telefoon: e.target.value || null })} />
                  </td>
                  <td>
                    <input className="st-input cell-mono" style={{ width: '100%' }} placeholder="—"
                      value={c.mobiel ?? ''} onChange={e => update(c.id, { mobiel: e.target.value || null })} />
                  </td>
                  <td>
                    <input className="st-input" style={{ width: '100%' }} placeholder="—"
                      value={c.email ?? ''} onChange={e => update(c.id, { email: e.target.value || null })} />
                  </td>
                  <td>
                    <button className="st-icon-btn" title="Verwijderen" onClick={() => removeRow(c.id)}>
                      <IconTrash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
