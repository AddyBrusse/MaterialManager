import { useForm } from '@mantine/form'
import { Select, Button, Text, Group, Stack, NumberInput, Divider } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import type { CreateRawMaterial } from '@stockmanager/shared'
import { rawMaterialsApi, type RawMaterialRow } from '../../api/raw-materials'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { surfaceFinishesApi } from '../../api/surface-finishes'
import { meldFout } from '../../utils/fout-melding-toon'

/** Next unique #NNNNN code: max numeric part of existing rows + 1, zero-padded.
 *  Mirrors nextCode() in RawMaterialForm so codes never collide. */
function nextCode(rows: RawMaterialRow[]): string {
  const nums = rows.map(r => parseInt(r.code.replace('#', ''), 10)).filter(n => !isNaN(n))
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `#${String(next).padStart(5, '0')}`
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

/** Snel een ontbrekend materiaal in de voorraad zetten, vanuit de materiaalkiezer. */
export function NieuwMateriaal({ stockRows, grades, profiles, onCreated, onAnnuleer }: {
  stockRows: RawMaterialRow[]
  grades: { id: string; name: string }[]
  profiles: { id: string; name: string }[]
  onCreated: (row: RawMaterialRow) => void
  onAnnuleer: () => void
}) {
  const qc = useQueryClient()
  const { data: gradesData } = useQuery({ queryKey: ['grades'], queryFn: gradesApi.list })
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const { data: finishesData } = useQuery({ queryKey: ['surface-finishes'], queryFn: surfaceFinishesApi.list })
  const fullGrades = gradesData?.data ?? []
  const fullProfiles = profilesData?.data ?? []
  const fullFinishes = finishesData?.data ?? []

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
      notifications.show({ color: 'green', message: `Materiaal ${data.code} toegevoegd aan de voorraad` })
      form.reset()
      onCreated(data)
    },
    onError: (fout) => meldFout({ actie: 'Nieuw materiaal toevoegen', fout, gevolg: 'Er is geen materiaal aangemaakt. Je invoer staat nog in het formulier.' }),
  })

  return (
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
          <Button size="xs" variant="default" onClick={onAnnuleer}>
            Annuleren
          </Button>
          <Button size="xs" type="submit" loading={createMut.isPending}>
            Toevoegen aan voorraad
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
