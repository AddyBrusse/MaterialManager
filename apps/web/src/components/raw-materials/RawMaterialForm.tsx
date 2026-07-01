import { useEffect, useMemo, useRef, useState } from 'react'
import { Stack, Select, NumberInput, Button, Group, Text, Divider, TextInput, Badge } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconX, IconLock } from '@tabler/icons-react'
import { rawMaterialsApi } from '../../api/raw-materials'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { surfaceFinishesApi } from '../../api/surface-finishes'
import { locationsApi } from '../../api/locations'
import { locksApi } from '../../api/locks'
import type { RawMaterialRow } from '../../api/raw-materials'

const LOCK_HEARTBEAT_MS = 60_000

/** Derive next unique code from existing rows: max numeric part + 1, zero-padded to 5 digits. */
function nextCode(rows: RawMaterialRow[]): string {
  const nums = rows.map(r => parseInt(r.code.replace('#', ''), 10)).filter(n => !isNaN(n))
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `#${String(next).padStart(5, '0')}`
}

type FormValues = {
  code: string
  gradeId: string
  profileId: string
  surfaceFinishId: string
  dimensions: Record<string, number | string>
  lengthMm: number | ''
  locationSlotId: string
  minStock: number | ''
}

type Props = {
  mode: 'add' | 'edit'
  item?: RawMaterialRow
  opened: boolean
  onClose: () => void
  allRows?: RawMaterialRow[]   // passed from parent so auto-code is based on real data
}

const EMPTY: FormValues = {
  code: '', gradeId: '', profileId: '', surfaceFinishId: '', dimensions: {},
  lengthMm: '', locationSlotId: '', minStock: '',
}

export function RawMaterialForm({ mode, item, opened, onClose, allRows = [] }: Props) {
  const qc = useQueryClient()

  const { data: gradesData }         = useQuery({ queryKey: ['grades'],          queryFn: gradesApi.list })
  const { data: profilesData }       = useQuery({ queryKey: ['profiles'],        queryFn: profilesApi.list })
  const { data: surfaceFinishesData } = useQuery({ queryKey: ['surface-finishes'], queryFn: surfaceFinishesApi.list })
  const { data: locationsData }      = useQuery({ queryKey: ['locations'],       queryFn: locationsApi.list })

  const autoCode = useMemo(() => nextCode(allRows), [allRows])

  // Editing an existing item requires holding a lock (enforced server-side on
  // PATCH /raw-materials/:id) — acquire it while the drawer is open, refresh
  // it periodically, and release it on close. Without this, every save 409s.
  const [lockError, setLockError] = useState<string | null>(null)
  const lockedItemId = useRef<string | null>(null)

  useEffect(() => {
    if (!opened || mode !== 'edit' || !item) {
      setLockError(null)
      return
    }
    let cancelled = false
    setLockError(null)
    locksApi.acquire(item.id, 'raw')
      .then(() => { if (!cancelled) lockedItemId.current = item.id })
      .catch((e: Error) => { if (!cancelled) setLockError(e.message || 'Kon geen vergrendeling verkrijgen') })

    const heartbeat = setInterval(() => {
      locksApi.heartbeat(item.id, 'raw').catch(() => {})
    }, LOCK_HEARTBEAT_MS)

    return () => {
      cancelled = true
      clearInterval(heartbeat)
      if (lockedItemId.current === item.id) {
        locksApi.release(item.id, 'raw').catch(() => {})
        lockedItemId.current = null
      }
    }
  }, [opened, item?.id, mode])

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: {
      gradeId:    (v) => !v ? 'Grade is verplicht' : null,
      profileId:  (v) => !v ? 'Profiel is verplicht' : null,
      lengthMm:   (v) => (!v || Number(v) <= 0) ? 'Lengte moet positief zijn' : null,
      dimensions: (v, vals) => {
        const prfl = profiles.find(p => p.id === vals.profileId)
        if (!prfl || prfl.dimensionSchema.length === 0) return null
        const missing = prfl.dimensionSchema.filter(f => !v[f.key] || Number(v[f.key]) <= 0)
        return missing.length > 0
          ? `Vul alle afmetingen in: ${missing.map(f => f.label).join(', ')}`
          : null
      },
    },
  })

  // populate / reset when drawer opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!opened) return
    if (mode === 'edit' && item) {
      form.setValues({
        code: item.code,
        gradeId: item.gradeId,
        profileId: item.profileId,
        surfaceFinishId: item.surfaceFinish?.id ?? '',
        dimensions: Object.fromEntries(Object.entries(item.dimensions).map(([k, v]) => [k, v])),
        lengthMm: Number(item.lengthMm),
        locationSlotId: item.locationSlot?.id ?? '',
        minStock: item.minStock !== null ? Number(item.minStock) : '',
      })
      form.clearErrors()
    } else {
      form.reset()
    }
  }, [opened, item?.id, mode])

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const dims = Object.fromEntries(
        Object.entries(v.dimensions).map(([k, val]) => [k, Number(val)])
      )
      const base = {
        gradeId: v.gradeId,
        profileId: v.profileId,
        surfaceFinishId: v.surfaceFinishId || undefined,
        dimensions: dims,
        lengthMm: Number(v.lengthMm),
        locationSlotId: v.locationSlotId || undefined,
        minStock: v.minStock !== '' ? Number(v.minStock) : undefined,
      }
      return mode === 'edit' && item
        ? rawMaterialsApi.update(item.id, base)
        : rawMaterialsApi.create({ ...base, code: autoCode })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      notifications.show({ color: 'green', message: mode === 'add' ? 'Materiaal aangemaakt' : 'Materiaal bijgewerkt' })
      onClose()
    },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message }),
  })

  const profiles   = profilesData?.data  ?? []
  const activePrfl = profiles.find(p => p.id === form.values.profileId)

  const slotOptions = (locationsData?.data ?? []).map(loc => ({
    group: loc.label,
    items: loc.slots.map(s => ({
      value: s.id,
      label: s.level2 ? `${s.level1} · ${s.level2}` : s.level1,
    })),
  }))

  if (!opened) return null

  const title = mode === 'add' ? 'Materiaal toevoegen' : `Bewerken — ${item?.code}`

  return (
    <>
      <div className="st-drawer-scrim" onClick={onClose} />
      <aside className="st-drawer" style={{ width: 440 }}>
        {/* header */}
        <div className="st-drawer-hd">
          <span className="ttl" style={{ flex: 1 }}>{title}</span>
          <button className="st-icon-btn" onClick={onClose} aria-label="Sluiten">
            <IconX size={16} />
          </button>
        </div>

        {/* body */}
        <div className="st-drawer-bd">
          {lockError && (
            <Group gap={6} mb="sm" p="xs" style={{ background: 'var(--danger-soft)', borderRadius: 6, color: 'var(--danger)' }}>
              <IconLock size={14} />
              <Text size="xs">{lockError}</Text>
            </Group>
          )}
          <form id="mat-form" onSubmit={form.onSubmit(v => mutation.mutate(v))}>
            <Stack gap="sm">
              {mode === 'add' ? (
                <div>
                  <Text size="xs" fw={500} mb={4} c="dimmed">Code</Text>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600,
                    padding: '7px 10px', background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {autoCode}
                    <Badge size="xs" variant="light" color="blue" style={{ marginLeft: 'auto' }}>
                      automatisch
                    </Badge>
                  </div>
                </div>
              ) : (
                <TextInput
                  label="Code"
                  disabled
                  size="sm"
                  value={item?.code ?? ''}
                  readOnly
                />
              )}

              <Select
                label="Grade"
                placeholder="Kies grade…"
                size="sm"
                data={(gradesData?.data ?? []).map(g => ({ value: g.id, label: g.name }))}
                {...form.getInputProps('gradeId')}
              />

              <Select
                label="Profiel"
                placeholder="Kies profiel…"
                size="sm"
                data={profiles.map(p => ({ value: p.id, label: p.name }))}
                value={form.values.profileId || null}
                onChange={id => {
                  form.setFieldValue('profileId', id ?? '')
                  form.setFieldValue('dimensions', {})
                }}
                error={form.errors.profileId}
              />

              <Select
                label="Afwerking"
                placeholder="Optioneel"
                size="sm"
                clearable
                data={(surfaceFinishesData?.data ?? []).map(s => ({ value: s.id, label: s.name }))}
                {...form.getInputProps('surfaceFinishId')}
              />

              {activePrfl && activePrfl.dimensionSchema.length > 0 && (
                <>
                  <Text size="xs" fw={600} c="dimmed" mt={4}>Afmetingen</Text>
                  {activePrfl.dimensionSchema.map(field => (
                    <NumberInput
                      key={field.key}
                      label={`${field.label} (${field.unit})`}
                      placeholder="0"
                      min={0}
                      size="sm"
                      value={form.values.dimensions[field.key] ?? ''}
                      onChange={v => form.setFieldValue('dimensions', { ...form.values.dimensions, [field.key]: v })}
                    />
                  ))}
                </>
              )}

              <NumberInput
                label="Lengte (mm)"
                placeholder="0"
                min={1}
                size="sm"
                {...form.getInputProps('lengthMm')}
              />

              <Divider />

              <Select
                label="Locatie"
                placeholder="Optioneel"
                size="sm"
                data={slotOptions}
                clearable
                {...form.getInputProps('locationSlotId')}
              />

              <NumberInput
                label="Min. voorraad"
                placeholder="Optioneel"
                min={0}
                size="sm"
                {...form.getInputProps('minStock')}
              />
            </Stack>
          </form>
        </div>

        {/* footer */}
        <div className="st-drawer-ft">
          <Group justify="flex-end" style={{ width: '100%' }}>
            <Button variant="default" size="xs" onClick={onClose}>Annuleren</Button>
            <Button
              type="submit"
              form="mat-form"
              size="xs"
              loading={mutation.isPending}
              disabled={!!lockError}
            >
              {mode === 'add' ? 'Aanmaken' : 'Opslaan'}
            </Button>
          </Group>
        </div>
      </aside>
    </>
  )
}
