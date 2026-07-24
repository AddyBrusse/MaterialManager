import { useMemo, useState } from 'react'
import {
  Modal, Select, Button, Text, Group, Stack, Collapse, NumberInput, Divider,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconChevronDown } from '@tabler/icons-react'
import type { CreateRawMaterial } from '@stockmanager/shared'
import { rawMaterialsApi, formatDimensions } from '../../api/raw-materials'
import type { RawMaterialRow } from '../../api/raw-materials'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { surfaceFinishesApi } from '../../api/surface-finishes'
import './article-pickers.css'

interface MaterialPickerModalProps {
  opened: boolean
  onClose: () => void
  stockRows: RawMaterialRow[]
  grades: { id: string; name: string }[]
  profiles: { id: string; name: string; volumeFormula: string }[]
  onPick: (row: RawMaterialRow) => void
  onCreated: (row: RawMaterialRow) => void
}

const ALLE = '__alle__'

/** Next unique #NNNNN code: max numeric part of existing rows + 1, zero-padded.
 *  Mirrors nextCode() in RawMaterialForm so codes never collide. */
function nextCode(rows: RawMaterialRow[]): string {
  const nums = rows.map(r => parseInt(r.code.replace('#', ''), 10)).filter(n => !isNaN(n))
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `#${String(next).padStart(5, '0')}`
}

const GRID = '1fr 96px 118px 96px 90px'

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'nl'))
}

type QuickAddValues = {
  gradeId: string
  profileId: string
  surfaceFinishId: string
  dimensions: Record<string, number | string>
  lengthMm: number | ''
}

const QUICK_EMPTY: QuickAddValues = {
  gradeId: '', profileId: '', surfaceFinishId: '', dimensions: {}, lengthMm: '',
}

export function MaterialPickerModal({
  opened, onClose, stockRows, grades, profiles, onPick, onCreated,
}: MaterialPickerModalProps) {
  const qc = useQueryClient()

  const [fGrade, setFGrade] = useState<string>(ALLE)
  const [fProfile, setFProfile] = useState<string>(ALLE)
  const [fFinish, setFFinish] = useState<string>(ALLE)
  const [fSize, setFSize] = useState<string>(ALLE)
  const [addOpen, setAddOpen] = useState(false)

  // Full grade/profile/finish data for the quick-add form (dimensionSchema,
  // pricePerKg) — reads only, never mutates shared state.
  const { data: gradesData } = useQuery({ queryKey: ['grades'], queryFn: gradesApi.list })
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const { data: finishesData } = useQuery({ queryKey: ['surface-finishes'], queryFn: surfaceFinishesApi.list })

  const fullGrades = gradesData?.data ?? []
  const fullProfiles = profilesData?.data ?? []
  const fullFinishes = finishesData?.data ?? []

  const priceByGradeId = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of fullGrades) if (typeof g.pricePerKg === 'number') m.set(g.id, g.pricePerKg)
    return m
  }, [fullGrades])

  const gradeOpts = useMemo(() => uniq(stockRows.map(r => r.grade.name)), [stockRows])
  const profileOpts = useMemo(() => uniq(stockRows.map(r => r.profile.name)), [stockRows])
  const finishOpts = useMemo(() => uniq(stockRows.map(r => r.surfaceFinish?.name ?? '')), [stockRows])
  const sizeOpts = useMemo(
    () => uniq(stockRows.map(r => formatDimensions(r.profile, r.dimensions))),
    [stockRows],
  )

  const filtered = useMemo(() => stockRows.filter(r => {
    if (fGrade !== ALLE && r.grade.name !== fGrade) return false
    if (fProfile !== ALLE && r.profile.name !== fProfile) return false
    if (fFinish !== ALLE && (r.surfaceFinish?.name ?? '') !== fFinish) return false
    if (fSize !== ALLE && formatDimensions(r.profile, r.dimensions) !== fSize) return false
    return true
  }), [stockRows, fGrade, fProfile, fFinish, fSize])

  const form = useForm<QuickAddValues>({
    initialValues: QUICK_EMPTY,
    validate: {
      gradeId: v => (!v ? 'Grade is verplicht' : null),
      profileId: v => (!v ? 'Profiel is verplicht' : null),
      lengthMm: v => (!v || Number(v) <= 0 ? 'Lengte moet positief zijn' : null),
      dimensions: (v, vals) => {
        const prfl = fullProfiles.find(p => p.id === vals.profileId)
        if (!prfl || prfl.dimensionSchema.length === 0) return null
        const missing = prfl.dimensionSchema.filter(f => !v[f.key] || Number(v[f.key]) <= 0)
        return missing.length
          ? `Vul alle afmetingen in: ${missing.map(f => f.label).join(', ')}`
          : null
      },
    },
  })

  const activePrfl = fullProfiles.find(p => p.id === form.values.profileId)

  const createMut = useMutation({
    mutationFn: (v: QuickAddValues) => {
      const dims = Object.fromEntries(
        Object.entries(v.dimensions).map(([k, val]) => [k, Number(val)]),
      )
      const body: CreateRawMaterial = {
        code: nextCode(stockRows),
        gradeId: v.gradeId,
        profileId: v.profileId,
        surfaceFinishId: v.surfaceFinishId || undefined,
        dimensions: dims,
        lengthMm: Number(v.lengthMm),
        // no locationSlotId — quick-add lands the material in Voorraad without a slot
      }
      return rawMaterialsApi.create(body)
    },
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      notifications.show({ color: 'green', message: `Materiaal ${data.code} toegevoegd aan voorraad` })
      form.reset()
      setAddOpen(false)
      onCreated(data)
      onClose()
    },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message }),
  })

  function choose(row: RawMaterialRow) {
    onPick(row)
    onClose()
  }

  function low(row: RawMaterialRow): boolean {
    const cur = Number(row.currentStock)
    if (row.minStock !== null) return cur < Number(row.minStock)
    return cur < 20
  }

  const selOpts = (label: string, opts: string[]) => ({
    label,
    data: [{ value: ALLE, label: 'Alle' }, ...opts.map(o => ({ value: o, label: o }))],
  })

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={780}
      radius="md"
      centered
      title="Materiaal uit voorraad"
      styles={{ title: { fontWeight: 600 } }}
    >
      {/* Filter bar */}
      <div className="apk-filterbar">
        <Select size="xs" allowDeselect={false} {...selOpts('Grade', gradeOpts)}
          value={fGrade} onChange={v => setFGrade(v ?? ALLE)} />
        <Select size="xs" allowDeselect={false} {...selOpts('Vorm', profileOpts)}
          value={fProfile} onChange={v => setFProfile(v ?? ALLE)} />
        <Select size="xs" allowDeselect={false} {...selOpts('Finish', finishOpts)}
          value={fFinish} onChange={v => setFFinish(v ?? ALLE)} />
        <Select size="xs" allowDeselect={false} {...selOpts('Afmeting', sizeOpts)}
          value={fSize} onChange={v => setFSize(v ?? ALLE)} />
      </div>

      {/* Table */}
      <div className="apk-table-head" style={{ gridTemplateColumns: GRID }}>
        <span>Materiaal</span>
        <span>Afmeting</span>
        <span>Finish</span>
        <span className="apk-right">Voorraad</span>
        <span />
      </div>

      {filtered.length === 0 ? (
        <div className="apk-empty">Geen materiaal gevonden voor deze filters.</div>
      ) : (
        <div className="apk-mat-rows">
          {filtered.map(row => {
            const price = priceByGradeId.get(row.gradeId)
            return (
              <div key={row.id} className="apk-row" style={{ gridTemplateColumns: GRID }}>
                <div>
                  <Text size="sm" fw={500}>{row.grade.name} — {row.profile.name}</Text>
                  {price !== undefined && (
                    <div className="apk-price">€ {price.toFixed(2).replace('.', ',')} /kg</div>
                  )}
                </div>
                <Text size="xs" className="apk-mono">
                  {formatDimensions(row.profile, row.dimensions)} mm
                </Text>
                <Text size="xs" c="dimmed">{row.surfaceFinish?.name ?? '—'}</Text>
                <Text
                  size="xs"
                  className="apk-mono apk-right"
                  style={low(row) ? { color: 'var(--warning)' } : undefined}
                >
                  {Number(row.currentStock)} st
                </Text>
                <Button size="xs" onClick={() => choose(row)}>+ Kies</Button>
              </div>
            )
          })}
        </div>
      )}

      {/* Quick-add: create a missing material straight into Voorraad */}
      <div className="apk-quickadd">
        <Group
          justify="space-between"
          onClick={() => setAddOpen(o => !o)}
          style={{ cursor: 'pointer' }}
        >
          <Group gap={6}>
            <IconPlus size={15} color="var(--accent)" />
            <Text size="sm" fw={500} c="var(--accent)">Nieuw materiaal</Text>
          </Group>
          <IconChevronDown
            size={16}
            style={{ transform: addOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
          />
        </Group>

        <Collapse in={addOpen}>
          <form onSubmit={form.onSubmit(v => createMut.mutate(v))}>
            <Stack gap="sm" mt="sm">
              <Text size="xs" c="dimmed">
                Wordt toegevoegd als <b>{nextCode(stockRows)}</b> zonder opslaglocatie.
              </Text>

              <Group grow align="flex-start">
                <Select
                  size="xs"
                  label="Grade"
                  placeholder="Kies grade…"
                  data={(fullGrades.length ? fullGrades : grades).map(g => ({ value: g.id, label: g.name }))}
                  {...form.getInputProps('gradeId')}
                />
                <Select
                  size="xs"
                  label="Vorm"
                  placeholder="Kies profiel…"
                  data={(fullProfiles.length ? fullProfiles : profiles).map(p => ({ value: p.id, label: p.name }))}
                  value={form.values.profileId || null}
                  onChange={id => {
                    form.setFieldValue('profileId', id ?? '')
                    form.setFieldValue('dimensions', {})
                  }}
                  error={form.errors.profileId}
                />
              </Group>

              {activePrfl && activePrfl.dimensionSchema.length > 0 && (
                <Group grow align="flex-start">
                  {activePrfl.dimensionSchema.map(field => (
                    <NumberInput
                      key={field.key}
                      size="xs"
                      label={`${field.label} (${field.unit})`}
                      placeholder="0"
                      min={0}
                      value={form.values.dimensions[field.key] ?? ''}
                      onChange={v => form.setFieldValue('dimensions', {
                        ...form.values.dimensions, [field.key]: v,
                      })}
                    />
                  ))}
                </Group>
              )}
              {form.errors.dimensions && (
                <Text size="xs" c="red">{form.errors.dimensions}</Text>
              )}

              <Group grow align="flex-start">
                <NumberInput
                  size="xs"
                  label="Lengte (mm)"
                  placeholder="0"
                  min={1}
                  {...form.getInputProps('lengthMm')}
                />
                <Select
                  size="xs"
                  label="Finish (optioneel)"
                  placeholder="Geen"
                  clearable
                  data={fullFinishes.map(f => ({ value: f.id, label: f.name }))}
                  {...form.getInputProps('surfaceFinishId')}
                />
              </Group>

              <Divider />
              <Group justify="flex-end">
                <Button size="xs" variant="default" onClick={() => setAddOpen(false)}>
                  Annuleren
                </Button>
                <Button size="xs" type="submit" loading={createMut.isPending}>
                  Toevoegen aan voorraad
                </Button>
              </Group>
            </Stack>
          </form>
        </Collapse>
      </div>
    </Modal>
  )
}
