import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconEdit, IconTrash, IconX, IconCheck, IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { locationsApi } from '../../api/locations'
import type { LocationWithSlots, SlotOption } from '../../api/locations'

const KIND_LABELS: Record<string, string> = { rack: 'Stelling', cabinet: 'Kast' }

type LocEdit = { id: string; label: string; kind: 'rack' | 'cabinet' } | null
type LocAdd  = { label: string; kind: 'rack' | 'cabinet' } | null
type SlotAdd = { locationId: string; level1: string; level2: string } | null

export function LocationsTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list })
  const locations = data?.data ?? []

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [locEdit, setLocEdit]   = useState<LocEdit>(null)
  const [locAdd, setLocAdd]     = useState<LocAdd>(null)
  const [slotAdd, setSlotAdd]   = useState<SlotAdd>(null)
  const [deleteLocId, setDeleteLocId]   = useState<string | null>(null)
  const [deleteSlot, setDeleteSlot]     = useState<{ locId: string; slotId: string } | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['locations'] })

  const createLocMut = useMutation({
    mutationFn: (b: { kind: 'rack' | 'cabinet'; label: string }) => locationsApi.createLocation(b),
    onSuccess: () => { invalidate(); setLocAdd(null); notifications.show({ color: 'green', message: 'Locatie aangemaakt' }) },
    onError: () => notifications.show({ color: 'red', message: 'Aanmaken mislukt' }),
  })
  const updateLocMut = useMutation({
    mutationFn: ({ id, ...b }: { id: string; label: string; kind: 'rack' | 'cabinet' }) => locationsApi.updateLocation(id, b),
    onSuccess: () => { invalidate(); setLocEdit(null); notifications.show({ color: 'green', message: 'Locatie bijgewerkt' }) },
    onError: () => notifications.show({ color: 'red', message: 'Opslaan mislukt' }),
  })
  const deleteLocMut = useMutation({
    mutationFn: locationsApi.removeLocation,
    onSuccess: () => { invalidate(); setDeleteLocId(null); notifications.show({ color: 'green', message: 'Locatie verwijderd' }) },
    onError: () => notifications.show({ color: 'red', message: 'Verwijderen mislukt' }),
  })
  const addSlotMut = useMutation({
    mutationFn: ({ locationId, ...b }: { locationId: string; level1: string; level2: string }) =>
      locationsApi.addSlot(locationId, { level1: b.level1, level2: b.level2 || null }),
    onSuccess: () => { invalidate(); setSlotAdd(null); notifications.show({ color: 'green', message: 'Vak toegevoegd' }) },
    onError: () => notifications.show({ color: 'red', message: 'Toevoegen mislukt' }),
  })
  const deleteSlotMut = useMutation({
    mutationFn: ({ locId, slotId }: { locId: string; slotId: string }) => locationsApi.removeSlot(locId, slotId),
    onSuccess: () => { invalidate(); setDeleteSlot(null); notifications.show({ color: 'green', message: 'Vak verwijderd' }) },
    onError: () => notifications.show({ color: 'red', message: 'Verwijderen mislukt' }),
  })

  function toggle(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Magazijnlocaties</h3>
          <p style={{ color: 'var(--text-3)', margin: '2px 0 0', fontSize: 12.5 }}>
            Hallen en stellingen met vakken waar materialen liggen.
          </p>
        </div>
        <button className="st-btn primary sm" style={{ marginLeft: 'auto' }}
          onClick={() => { setLocAdd({ label: '', kind: 'rack' }); setLocEdit(null) }}>
          <IconPlus size={12} />Locatie
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
        <table className="st-tbl">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th>Naam</th>
              <th>Type</th>
              <th style={{ textAlign: 'right', width: 64 }}>Vakken</th>
              <th style={{ width: 72 }} />
            </tr>
          </thead>
          <tbody>
            {locations.map((loc: LocationWithSlots) => {
              const open = expanded.has(loc.id)
              const isEditRow = locEdit?.id === loc.id
              const isDeleteRow = deleteLocId === loc.id

              return (
                <React.Fragment key={loc.id}>
                  {/* location row */}
                  {isEditRow ? (
                    <tr key={`${loc.id}-edit`} style={{ background: 'var(--bg-sidebar)' }}>
                      <td />
                      <td>
                        <input className="st-input" style={{ width: '100%' }} value={locEdit.label}
                          onChange={e => setLocEdit({ ...locEdit, label: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Escape') setLocEdit(null) }}
                          autoFocus />
                      </td>
                      <td>
                        <select className="st-select" value={locEdit.kind}
                          onChange={e => setLocEdit({ ...locEdit, kind: e.target.value as 'rack' | 'cabinet' })}>
                          <option value="rack">Stelling</option>
                          <option value="cabinet">Kast</option>
                        </select>
                      </td>
                      <td />
                      <td>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                          <button className="st-icon-btn" onClick={() => updateLocMut.mutate(locEdit)}><IconCheck size={14} /></button>
                          <button className="st-icon-btn" onClick={() => setLocEdit(null)}><IconX size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ) : isDeleteRow ? (
                    <tr key={`${loc.id}-del`} style={{ background: 'rgba(184,39,12,0.04)' }}>
                      <td />
                      <td colSpan={3}>
                        <span style={{ fontSize: 12.5 }}><strong>{loc.label}</strong> + alle {loc.slots.length} vakken verwijderen?</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                          <button className="st-btn xs danger" onClick={() => deleteLocMut.mutate(loc.id)} style={{ fontSize: 11 }}>Ja</button>
                          <button className="st-icon-btn" onClick={() => setDeleteLocId(null)}><IconX size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={loc.id} style={{ cursor: 'pointer' }} onClick={() => toggle(loc.id)}>
                      <td style={{ color: 'var(--text-3)' }}>
                        {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                      </td>
                      <td className="cell-strong">{loc.label}</td>
                      <td className="cell-muted">{KIND_LABELS[loc.kind] ?? loc.kind}</td>
                      <td className="cell-num">{loc.slots.length}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="st-icon-btn" title="Bewerken"
                            onClick={() => { setLocEdit({ id: loc.id, label: loc.label, kind: loc.kind }); setLocAdd(null) }}>
                            <IconEdit size={14} />
                          </button>
                          <button className="st-icon-btn danger" title="Verwijderen" onClick={() => setDeleteLocId(loc.id)}>
                            <IconTrash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* expanded slots */}
                  {open && !isEditRow && !isDeleteRow && (
                    <>
                      {loc.slots.map((s: SlotOption) => {
                        const isSlotDel = deleteSlot?.locId === loc.id && deleteSlot?.slotId === s.id
                        const slotLabel = s.level2 ? `${s.level1} · ${s.level2}` : s.level1
                        return isSlotDel ? (
                          <tr key={`${s.id}-del`} style={{ background: 'rgba(184,39,12,0.04)' }}>
                            <td />
                            <td colSpan={3} style={{ fontSize: 12.5, paddingLeft: 32 }}>
                              Vak <strong>{slotLabel}</strong> verwijderen?
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                                <button className="st-btn xs danger" style={{ fontSize: 11 }}
                                  onClick={() => deleteSlotMut.mutate({ locId: loc.id, slotId: s.id })}>Ja</button>
                                <button className="st-icon-btn" onClick={() => setDeleteSlot(null)}><IconX size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={s.id} style={{ background: 'var(--bg-sidebar)' }}>
                            <td />
                            <td style={{ paddingLeft: 32, fontSize: 12.5, color: 'var(--text-3)' }}>
                              <span className="cell-mono">{slotLabel}</span>
                            </td>
                            <td />
                            <td />
                            <td>
                              <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                                <button className="st-icon-btn danger" title="Verwijderen"
                                  onClick={() => setDeleteSlot({ locId: loc.id, slotId: s.id })}>
                                  <IconTrash size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}

                      {/* add slot row */}
                      {slotAdd?.locationId === loc.id ? (
                        <tr style={{ background: 'var(--bg-sidebar)' }}>
                          <td />
                          <td style={{ paddingLeft: 32 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <input className="st-input cell-mono" style={{ width: 80 }} placeholder="R1"
                                value={slotAdd.level1}
                                onChange={e => setSlotAdd({ ...slotAdd, level1: e.target.value })} autoFocus />
                              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>·</span>
                              <input className="st-input cell-mono" style={{ width: 80 }} placeholder="V1 (opt.)"
                                value={slotAdd.level2}
                                onChange={e => setSlotAdd({ ...slotAdd, level2: e.target.value })} />
                            </div>
                          </td>
                          <td />
                          <td />
                          <td>
                            <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                              <button className="st-icon-btn" onClick={() => {
                                if (slotAdd.level1.trim()) addSlotMut.mutate(slotAdd)
                              }}><IconCheck size={14} /></button>
                              <button className="st-icon-btn" onClick={() => setSlotAdd(null)}><IconX size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr style={{ background: 'var(--bg-sidebar)' }}>
                          <td />
                          <td colSpan={4} style={{ paddingLeft: 32, paddingTop: 4, paddingBottom: 4 }}>
                            <button className="st-btn sm" style={{ fontSize: 11 }}
                              onClick={() => setSlotAdd({ locationId: loc.id, level1: '', level2: '' })}>
                              <IconPlus size={10} />Vak toevoegen
                            </button>
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </React.Fragment>
              )
            })}

            {/* add location row */}
            {locAdd && (
              <tr style={{ background: 'var(--bg-sidebar)' }}>
                <td />
                <td>
                  <input className="st-input" style={{ width: '100%' }} placeholder="bijv. Hal D · Stelling 01"
                    value={locAdd.label}
                    onChange={e => setLocAdd({ ...locAdd, label: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && locAdd.label.trim()) createLocMut.mutate(locAdd)
                      if (e.key === 'Escape') setLocAdd(null)
                    }}
                    autoFocus />
                </td>
                <td>
                  <select className="st-select" value={locAdd.kind}
                    onChange={e => setLocAdd({ ...locAdd, kind: e.target.value as 'rack' | 'cabinet' })}>
                    <option value="rack">Stelling</option>
                    <option value="cabinet">Kast</option>
                  </select>
                </td>
                <td />
                <td>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="st-icon-btn"
                      onClick={() => { if (locAdd.label.trim()) createLocMut.mutate(locAdd) }}><IconCheck size={14} /></button>
                    <button className="st-icon-btn" onClick={() => setLocAdd(null)}><IconX size={14} /></button>
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
