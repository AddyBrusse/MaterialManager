import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { Stack, Select, TextInput, Button, Group } from '@mantine/core'
import { IconPlus, IconEdit, IconTrash, IconX } from '@tabler/icons-react'
import { profilesApi } from '../../api/profiles'
import type { Profile } from '@stockmanager/shared'
import type { DimField } from '../../api/profiles'

type FormState = {
  name: string
  volumeFormula: Profile['volumeFormula']
  dimensionSchema: DimField[]
}

const FORMULA_OPTS = [
  { value: 'round',  label: 'Rond (cirkel)'       },
  { value: 'square', label: 'Vierkant'             },
  { value: 'flat',   label: 'Plat / Rechthoekig'  },
  { value: 'tube',   label: 'Buis (hol)'          },
]

const FORMULA_LABELS: Record<string, string> = {
  round: 'Rond', square: 'Vierkant', flat: 'Plat', tube: 'Buis',
}

const EMPTY_FORM: FormState = { name: '', volumeFormula: 'round', dimensionSchema: [{ key: 'diameter', label: 'Diameter', unit: 'mm' }] }

function ProfileForm({
  initial, onSave, onCancel, loading,
}: {
  initial: FormState; onSave: (v: FormState) => void; onCancel: () => void; loading: boolean
}) {
  const [v, setV] = useState<FormState>(initial)

  function addDim() {
    setV(p => ({ ...p, dimensionSchema: [...p.dimensionSchema, { key: '', label: '', unit: 'mm' }] }))
  }
  function removeDim(i: number) {
    setV(p => ({ ...p, dimensionSchema: p.dimensionSchema.filter((_, j) => j !== i) }))
  }
  function setDim(i: number, field: keyof DimField, val: string) {
    setV(p => ({
      ...p,
      dimensionSchema: p.dimensionSchema.map((d, j) => j === i ? { ...d, [field]: val } : d),
    }))
  }

  const valid = v.name.trim() !== '' && v.dimensionSchema.length > 0 &&
    v.dimensionSchema.every(d => d.key.trim() && d.label.trim())

  return (
    <Stack gap="sm">
      <TextInput label="Naam" size="sm" placeholder="bijv. I-profiel"
        value={v.name} onChange={e => setV(p => ({ ...p, name: e.target.value }))} />
      <Select label="Volume formule" size="sm" data={FORMULA_OPTS}
        value={v.volumeFormula} onChange={val => setV(p => ({ ...p, volumeFormula: (val ?? 'flat') as Profile['volumeFormula'] }))} />

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>
          AFMETINGSVELDEN
        </div>
        <Stack gap={6}>
          {v.dimensionSchema.map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px 28px', gap: 6, alignItems: 'center' }}>
              <input className="st-input" placeholder="Sleutel (bijv. width)" value={d.key}
                onChange={e => setDim(i, 'key', e.target.value)} />
              <input className="st-input" placeholder="Label (bijv. Breedte)" value={d.label}
                onChange={e => setDim(i, 'label', e.target.value)} />
              <input className="st-input" placeholder="Eenheid" value={d.unit}
                onChange={e => setDim(i, 'unit', e.target.value)} />
              <button className="st-icon-btn danger" onClick={() => removeDim(i)} disabled={v.dimensionSchema.length === 1}>
                <IconX size={13} />
              </button>
            </div>
          ))}
        </Stack>
        <button className="st-btn sm" style={{ marginTop: 6 }} onClick={addDim}>
          <IconPlus size={11} />Veld toevoegen
        </button>
      </div>

      <Group justify="flex-end" gap="xs">
        <Button variant="default" size="xs" onClick={onCancel}>Annuleren</Button>
        <Button size="xs" loading={loading} disabled={!valid} onClick={() => onSave(v)}>Opslaan</Button>
      </Group>
    </Stack>
  )
}

export function ProfilesTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const profiles = data?.data ?? []

  const [editId, setEditId]   = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['profiles'] })

  const createMut = useMutation({
    mutationFn: profilesApi.create,
    onSuccess: () => { invalidate(); setShowAdd(false); notifications.show({ color: 'green', message: 'Profiel aangemaakt' }) },
    onError: () => notifications.show({ color: 'red', message: 'Aanmaken mislukt' }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...b }: FormState & { id: string }) => profilesApi.update(id, b),
    onSuccess: () => { invalidate(); setEditId(null); notifications.show({ color: 'green', message: 'Profiel bijgewerkt' }) },
    onError: () => notifications.show({ color: 'red', message: 'Opslaan mislukt' }),
  })
  const deleteMut = useMutation({
    mutationFn: profilesApi.remove,
    onSuccess: () => { invalidate(); setDeleteId(null); notifications.show({ color: 'green', message: 'Profiel verwijderd' }) },
    onError: () => notifications.show({ color: 'red', message: 'Verwijderen mislukt' }),
  })

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Profielen / Vormen</h3>
          <p style={{ color: 'var(--text-3)', margin: '2px 0 0', fontSize: 12.5 }}>
            Dwarsdoorsneden met afmetingsvelden — bepalen hoe gewicht wordt berekend.
          </p>
        </div>
        <button className="st-btn primary sm" style={{ marginLeft: 'auto' }}
          onClick={() => { setShowAdd(true); setEditId(null) }}>
          <IconPlus size={12} />Profiel
        </button>
      </div>

      {showAdd && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 12, background: 'var(--bg-sidebar)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10, color: 'var(--text-2)' }}>Nieuw profiel</div>
          <ProfileForm
            initial={EMPTY_FORM}
            loading={createMut.isPending}
            onSave={v => createMut.mutate(v)}
            onCancel={() => setShowAdd(false)} />
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
        <table className="st-tbl">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Formule</th>
              <th>Afmetingsvelden</th>
              <th style={{ width: 72 }} />
            </tr>
          </thead>
          <tbody>
            {profiles.map((p: Profile) => (
              <>
                {editId === p.id ? (
                  <tr key={`${p.id}-edit`}>
                    <td colSpan={4} style={{ padding: 12 }}>
                      <ProfileForm
                        initial={{ name: p.name, volumeFormula: p.volumeFormula, dimensionSchema: p.dimensionSchema }}
                        loading={updateMut.isPending}
                        onSave={v => updateMut.mutate({ id: p.id, ...v })}
                        onCancel={() => setEditId(null)} />
                    </td>
                  </tr>
                ) : deleteId === p.id ? (
                  <tr key={`${p.id}-del`} style={{ background: 'rgba(184,39,12,0.04)' }}>
                    <td colSpan={3}>
                      <span style={{ fontSize: 12.5 }}>
                        <strong>{p.name}</strong> verwijderen?
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        <button className="st-btn xs danger" onClick={() => deleteMut.mutate(p.id)} style={{ fontSize: 11 }}>Ja</button>
                        <button className="st-icon-btn" onClick={() => setDeleteId(null)}><IconX size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id}>
                    <td className="cell-strong">{p.name}</td>
                    <td className="cell-muted">{FORMULA_LABELS[p.volumeFormula] ?? p.volumeFormula}</td>
                    <td style={{ fontSize: 12 }}>
                      {p.dimensionSchema.map(d => `${d.label} (${d.unit})`).join(', ')}
                    </td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="st-icon-btn" title="Bewerken"
                          onClick={() => { setEditId(p.id); setShowAdd(false) }}>
                          <IconEdit size={14} />
                        </button>
                        <button className="st-icon-btn danger" title="Verwijderen" onClick={() => setDeleteId(p.id)}>
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
