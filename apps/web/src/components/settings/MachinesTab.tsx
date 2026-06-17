import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconEdit, IconTrash, IconX, IconCheck } from '@tabler/icons-react'
import { machinesApi, type Machine, type MachineInput } from '../../api/machines'

type Num = number | ''
type Row = { name: string; machineRatePerHour: Num; operatorRatePerHour: Num; defaultSetupMin: Num }
type EditState = (Row & { id: string }) | null
type AddState  = Row | null

const EMPTY: Row = { name: '', machineRatePerHour: '', operatorRatePerHour: '', defaultSetupMin: 20 }

export function MachinesTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['machines'], queryFn: machinesApi.list })
  const machines = data?.data ?? []

  const [edit, setEdit] = useState<EditState>(null)
  const [add, setAdd]   = useState<AddState>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['machines'] })

  const createMut = useMutation({
    mutationFn: (b: MachineInput) => machinesApi.create(b),
    onSuccess: () => { invalidate(); setAdd(null); notifications.show({ color: 'green', message: 'Machine aangemaakt' }) },
    onError: () => notifications.show({ color: 'red', message: 'Aanmaken mislukt' }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...b }: MachineInput & { id: string }) => machinesApi.update(id, b),
    onSuccess: () => { invalidate(); setEdit(null); notifications.show({ color: 'green', message: 'Machine bijgewerkt' }) },
    onError: () => notifications.show({ color: 'red', message: 'Opslaan mislukt' }),
  })
  const deleteMut = useMutation({
    mutationFn: machinesApi.remove,
    onSuccess: () => { invalidate(); setDeleteId(null); notifications.show({ color: 'green', message: 'Machine verwijderd' }) },
    onError: () => notifications.show({ color: 'red', message: 'Verwijderen mislukt' }),
  })

  function toInput(r: Row): MachineInput | null {
    if (!r.name || r.machineRatePerHour === '' || r.operatorRatePerHour === '') return null
    return {
      name: r.name,
      machineRatePerHour: Number(r.machineRatePerHour),
      operatorRatePerHour: Number(r.operatorRatePerHour),
      defaultSetupMin: Number(r.defaultSetupMin) || 0,
    }
  }
  function saveEdit() { const v = edit && toInput(edit); if (v && edit) updateMut.mutate({ id: edit.id, ...v }) }
  function saveAdd()  { const v = add && toInput(add); if (v) createMut.mutate(v) }

  const numInput = (val: Num, set: (v: Num) => void, onKey: (e: React.KeyboardEvent) => void, ph?: string) => (
    <input className="st-input cell-mono" style={{ width: '100%', textAlign: 'right' }}
      type="number" min={0} step={1} placeholder={ph}
      value={val} onChange={e => set(e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={onKey} />
  )

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Machines</h3>
          <p style={{ color: 'var(--text-3)', margin: '2px 0 0', fontSize: 12.5 }}>
            Bewerkingscentra met machine- en operatortarief — gebruikt in de artikelcalculator.
          </p>
        </div>
        <button className="st-btn primary sm" style={{ marginLeft: 'auto' }}
          onClick={() => { setAdd({ ...EMPTY }); setEdit(null) }}>
          <IconPlus size={12} />Machine
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
        <table className="st-tbl">
          <thead>
            <tr>
              <th>Naam</th>
              <th style={{ textAlign: 'right' }}>Machine (€/u)</th>
              <th style={{ textAlign: 'right' }}>Operator (€/u)</th>
              <th style={{ textAlign: 'right' }}>Setup (min)</th>
              <th style={{ width: 72 }} />
            </tr>
          </thead>
          <tbody>
            {machines.map(m =>
              edit?.id === m.id ? (
                <tr key={m.id}>
                  <td>
                    <input className="st-input" style={{ width: '100%' }} value={edit.name} autoFocus
                      onChange={e => setEdit({ ...edit, name: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEdit(null) }} />
                  </td>
                  <td>{numInput(edit.machineRatePerHour, v => setEdit({ ...edit, machineRatePerHour: v }), e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEdit(null) })}</td>
                  <td>{numInput(edit.operatorRatePerHour, v => setEdit({ ...edit, operatorRatePerHour: v }), e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEdit(null) })}</td>
                  <td>{numInput(edit.defaultSetupMin, v => setEdit({ ...edit, defaultSetupMin: v }), e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEdit(null) })}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="st-icon-btn" title="Opslaan" onClick={saveEdit}><IconCheck size={14} /></button>
                      <button className="st-icon-btn" title="Annuleren" onClick={() => setEdit(null)}><IconX size={14} /></button>
                    </div>
                  </td>
                </tr>
              ) : deleteId === m.id ? (
                <tr key={m.id} style={{ background: 'rgba(184,39,12,0.04)' }}>
                  <td colSpan={4}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}><strong>{m.name}</strong> verwijderen?</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="st-btn xs danger" onClick={() => deleteMut.mutate(m.id)} style={{ fontSize: 11 }}>Ja</button>
                      <button className="st-icon-btn" onClick={() => setDeleteId(null)}><IconX size={14} /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={m.id}>
                  <td className="cell-strong">{m.name}</td>
                  <td className="cell-num cell-mono">€ {m.machineRatePerHour.toFixed(2)}</td>
                  <td className="cell-num cell-mono">€ {m.operatorRatePerHour.toFixed(2)}</td>
                  <td className="cell-num cell-mono">{m.defaultSetupMin}</td>
                  <td>
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="st-icon-btn" title="Bewerken"
                        onClick={() => { setEdit({ id: m.id, name: m.name, machineRatePerHour: m.machineRatePerHour, operatorRatePerHour: m.operatorRatePerHour, defaultSetupMin: m.defaultSetupMin }); setAdd(null) }}>
                        <IconEdit size={14} />
                      </button>
                      <button className="st-icon-btn danger" title="Verwijderen" onClick={() => setDeleteId(m.id)}>
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
                  <input className="st-input" style={{ width: '100%' }} placeholder="bijv. Mazak" value={add.name} autoFocus
                    onChange={e => setAdd({ ...add, name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdd(null) }} />
                </td>
                <td>{numInput(add.machineRatePerHour, v => setAdd({ ...add, machineRatePerHour: v }), e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdd(null) }, '75')}</td>
                <td>{numInput(add.operatorRatePerHour, v => setAdd({ ...add, operatorRatePerHour: v }), e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdd(null) }, '55')}</td>
                <td>{numInput(add.defaultSetupMin, v => setAdd({ ...add, defaultSetupMin: v }), e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdd(null) }, '20')}</td>
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
