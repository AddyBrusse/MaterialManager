import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconEdit, IconTrash, IconX, IconCheck } from '@tabler/icons-react'
import { gradesApi } from '../../api/grades'
import type { Grade } from '@stockmanager/shared'

type Num = number | ''
type EditState = { id: string; name: string; densityKgM3: Num; pricePerKg: Num } | null
type AddState = { name: string; densityKgM3: Num; pricePerKg: Num } | null

export function GradesTab() {
  const qc = useQueryClient()
  const { data: grades = [] } = useQuery({
    queryKey: ['grades'], queryFn: gradesApi.list, select: (data) => {
      return [...data.data].sort((a, b) => a.name.localeCompare(b.name));
    }
  })

  const [edit, setEdit] = useState<EditState>(null)
  const [add, setAdd] = useState<AddState>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['grades'] })

  const createMut = useMutation({
    mutationFn: (b: { name: string; densityKgM3: number; pricePerKg?: number }) => gradesApi.create(b),
    onSuccess: () => { invalidate(); setAdd(null); notifications.show({ color: 'green', message: 'Kwaliteit aangemaakt' }) },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message || 'Aanmaken mislukt' }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...b }: { id: string; name: string; densityKgM3: number; pricePerKg?: number }) => gradesApi.update(id, b),
    onSuccess: () => { invalidate(); setEdit(null); notifications.show({ color: 'green', message: 'Kwaliteit bijgewerkt' }) },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message || 'Opslaan mislukt' }),
  })
  const deleteMut = useMutation({
    mutationFn: gradesApi.remove,
    onSuccess: () => { invalidate(); setDeleteId(null); notifications.show({ color: 'green', message: 'Kwaliteit verwijderd' }) },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message || 'Verwijderen mislukt' }),
  })

  function saveEdit() {
    if (!edit || !edit.name || !edit.densityKgM3) return
    updateMut.mutate({
      id: edit.id, name: edit.name, densityKgM3: Number(edit.densityKgM3),
      pricePerKg: edit.pricePerKg === '' ? undefined : Number(edit.pricePerKg),
    })
  }
  function saveAdd() {
    if (!add || !add.name || !add.densityKgM3) return
    createMut.mutate({
      name: add.name, densityKgM3: Number(add.densityKgM3),
      pricePerKg: add.pricePerKg === '' ? undefined : Number(add.pricePerKg),
    })
  }

  const priceInput = (val: Num, set: (v: Num) => void, onKey: (e: React.KeyboardEvent) => void) => (
    <input className="st-input cell-mono" style={{ width: '100%', textAlign: 'right' }}
      type="number" min={0} step={0.01} placeholder="—"
      value={val} onChange={e => set(e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={onKey} />
  )

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Kwaliteiten / Staalsoorten</h3>
          <p style={{ color: 'var(--text-3)', margin: '2px 0 0', fontSize: 12.5 }}>
            Staalsoorten met dichtheid (gewicht) en prijs per kg (calculatie).
          </p>
        </div>
        <button className="st-btn primary sm" style={{ marginLeft: 'auto' }}
          onClick={() => { setAdd({ name: '', densityKgM3: 7850, pricePerKg: '' }); setEdit(null) }}>
          <IconPlus size={12} />Kwaliteit
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
        <table className="st-tbl">
          <thead>
            <tr>
              <th>Naam</th>
              <th style={{ textAlign: 'right' }}>Dichtheid (kg/m³)</th>
              <th style={{ textAlign: 'right' }}>Prijs (€/kg)</th>
              <th style={{ width: 72 }} />
            </tr>
          </thead>
          <tbody>
            {grades.map((g: Grade) =>
              edit?.id === g.id ? (
                <tr key={g.id}>
                  <td>
                    <input className="st-input" style={{ width: '100%' }}
                      value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEdit(null) }}
                      autoFocus />
                  </td>
                  <td>
                    <input className="st-input cell-mono" style={{ width: '100%', textAlign: 'right' }}
                      type="number" min={1} value={edit.densityKgM3}
                      onChange={e => setEdit({ ...edit, densityKgM3: e.target.value === '' ? '' : Number(e.target.value) })}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEdit(null) }} />
                  </td>
                  <td>{priceInput(edit.pricePerKg, v => setEdit({ ...edit, pricePerKg: v }), e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEdit(null) })}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="st-icon-btn" title="Opslaan" onClick={saveEdit}><IconCheck size={14} /></button>
                      <button className="st-icon-btn" title="Annuleren" onClick={() => setEdit(null)}><IconX size={14} /></button>
                    </div>
                  </td>
                </tr>
              ) : deleteId === g.id ? (
                <tr key={g.id} style={{ background: 'rgba(184,39,12,0.04)' }}>
                  <td colSpan={3}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                      <strong>{g.name}</strong> verwijderen?
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="st-btn xs danger" onClick={() => deleteMut.mutate(g.id)} style={{ fontSize: 11 }}>Ja</button>
                      <button className="st-icon-btn" onClick={() => setDeleteId(null)}><IconX size={14} /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={g.id}>
                  <td className="cell-strong">{g.name}</td>
                  <td className="cell-num cell-mono">{g.densityKgM3.toLocaleString('nl-NL')}</td>
                  <td className="cell-num cell-mono">{g.pricePerKg != null ? `€ ${g.pricePerKg.toFixed(2)}` : '—'}</td>
                  <td>
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="st-icon-btn" title="Bewerken"
                        onClick={() => { setEdit({ id: g.id, name: g.name, densityKgM3: g.densityKgM3, pricePerKg: g.pricePerKg ?? '' }); setAdd(null) }}>
                        <IconEdit size={14} />
                      </button>
                      <button className="st-icon-btn danger" title="Verwijderen" onClick={() => setDeleteId(g.id)}>
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
                  <input className="st-input" style={{ width: '100%' }} placeholder="bijv. S460"
                    value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdd(null) }}
                    autoFocus />
                </td>
                <td>
                  <input className="st-input cell-mono" style={{ width: '100%', textAlign: 'right' }}
                    type="number" min={1} placeholder="7850"
                    value={add.densityKgM3}
                    onChange={e => setAdd({ ...add, densityKgM3: e.target.value === '' ? '' : Number(e.target.value) })}
                    onKeyDown={e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdd(null) }} />
                </td>
                <td>{priceInput(add.pricePerKg, v => setAdd({ ...add, pricePerKg: v }), e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdd(null) })}</td>
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
