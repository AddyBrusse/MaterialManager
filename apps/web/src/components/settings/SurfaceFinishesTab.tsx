import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconEdit, IconTrash, IconX, IconCheck } from '@tabler/icons-react'
import { surfaceFinishesApi } from '../../api/surface-finishes'
import type { SurfaceFinish } from '@stockmanager/shared'

type EditState = { id: string; name: string } | null
type AddState  = { name: string } | null

export function SurfaceFinishesTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['surface-finishes'], queryFn: surfaceFinishesApi.list })
  const surfaceFinishes = data?.data ?? []

  const [edit, setEdit] = useState<EditState>(null)
  const [add, setAdd]   = useState<AddState>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['surface-finishes'] })

  const createMut = useMutation({
    mutationFn: (b: { name: string }) => surfaceFinishesApi.create(b),
    onSuccess: () => { invalidate(); setAdd(null); notifications.show({ color: 'green', message: 'Afwerking aangemaakt' }) },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message || 'Aanmaken mislukt' }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...b }: { id: string; name: string }) => surfaceFinishesApi.update(id, b),
    onSuccess: () => { invalidate(); setEdit(null); notifications.show({ color: 'green', message: 'Afwerking bijgewerkt' }) },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message || 'Opslaan mislukt' }),
  })
  const deleteMut = useMutation({
    mutationFn: surfaceFinishesApi.remove,
    onSuccess: () => { invalidate(); setDeleteId(null); notifications.show({ color: 'green', message: 'Afwerking verwijderd' }) },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message || 'Verwijderen mislukt' }),
  })

  function saveEdit() {
    if (!edit || !edit.name) return
    updateMut.mutate({ id: edit.id, name: edit.name })
  }
  function saveAdd() {
    if (!add || !add.name) return
    createMut.mutate({ name: add.name })
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Afwerkingen</h3>
          <p style={{ color: 'var(--text-3)', margin: '2px 0 0', fontSize: 12.5 }}>
            Oppervlakteafwerkingen voor materialen, bijv. Blank, Ruw, WGW (warmgewalst), KGW (koudgewalst).
          </p>
        </div>
        <button className="st-btn primary sm" style={{ marginLeft: 'auto' }}
          onClick={() => { setAdd({ name: '' }); setEdit(null) }}>
          <IconPlus size={12} />Afwerking
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
        <table className="st-tbl">
          <thead>
            <tr>
              <th>Naam</th>
              <th style={{ width: 72 }} />
            </tr>
          </thead>
          <tbody>
            {surfaceFinishes.map((s: SurfaceFinish) =>
              edit?.id === s.id ? (
                <tr key={s.id}>
                  <td>
                    <input className="st-input" style={{ width: '100%' }}
                      value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEdit(null) }}
                      autoFocus />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="st-icon-btn" title="Opslaan" onClick={saveEdit}><IconCheck size={14} /></button>
                      <button className="st-icon-btn" title="Annuleren" onClick={() => setEdit(null)}><IconX size={14} /></button>
                    </div>
                  </td>
                </tr>
              ) : deleteId === s.id ? (
                <tr key={s.id} style={{ background: 'rgba(184,39,12,0.04)' }}>
                  <td>
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                      <strong>{s.name}</strong> verwijderen?
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="st-btn xs danger" onClick={() => deleteMut.mutate(s.id)} style={{ fontSize: 11 }}>Ja</button>
                      <button className="st-icon-btn" onClick={() => setDeleteId(null)}><IconX size={14} /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={s.id}>
                  <td className="cell-strong">{s.name}</td>
                  <td>
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="st-icon-btn" title="Bewerken"
                        onClick={() => { setEdit({ id: s.id, name: s.name }); setAdd(null) }}>
                        <IconEdit size={14} />
                      </button>
                      <button className="st-icon-btn danger" title="Verwijderen" onClick={() => setDeleteId(s.id)}>
                        <IconTrash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}

            {add && (
              <tr style={{ background: 'var(--bg-sidebar)' }}>
                <td>
                  <input className="st-input" style={{ width: '100%' }} placeholder="bijv. Verzinkt"
                    value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdd(null) }}
                    autoFocus />
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="st-icon-btn" title="Toevoegen" onClick={saveAdd}><IconCheck size={14} /></button>
                    <button className="st-icon-btn" title="Annuleren" onClick={() => setAdd(null)}><IconX size={14} /></button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
