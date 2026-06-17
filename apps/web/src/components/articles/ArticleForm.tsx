import { useEffect, useMemo } from 'react'
import { Modal, Stack, Select, MultiSelect, NumberInput, TextInput, Textarea, Button, Group, Text, Divider, Badge } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { articlesApi, nextArtNo, KNOWN_OPERATIONS, type Article, type ArticleInput } from '../../api/articles'

type FormValues = {
  naam: string
  klant: string
  tekening: string
  rev: string
  locatie: string
  currentStock: number | ''
  minStock: number | ''
  maxStock: number | ''
  gradeId: string
  profileId: string
  dimensions: Record<string, number | string>
  lengthPerPieceMm: number | ''
  operations: string[]
  workholding: string
  general: string
}

const EMPTY: FormValues = {
  naam: '', klant: '', tekening: '', rev: '', locatie: '',
  currentStock: 0, minStock: '', maxStock: '',
  gradeId: '', profileId: '', dimensions: {}, lengthPerPieceMm: '',
  operations: [], workholding: '', general: '',
}

type Props = {
  mode: 'add' | 'edit'
  item?: Article
  opened: boolean
  onClose: () => void
  allRows?: Article[]
}

export function ArticleForm({ mode, item, opened, onClose, allRows = [] }: Props) {
  const qc = useQueryClient()
  const { data: gradesData }   = useQuery({ queryKey: ['grades'],   queryFn: gradesApi.list })
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })

  const autoNo = useMemo(() => nextArtNo(allRows), [allRows])
  const profiles = profilesData?.data ?? []

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: {
      naam: v => (!v.trim() ? 'Naam is verplicht' : null),
      lengthPerPieceMm: (v, values) =>
        // length is only required once a recipe (grade+profile) is being defined
        values.gradeId && values.profileId && (!v || Number(v) <= 0)
          ? 'Lengte per stuk moet positief zijn' : null,
    },
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!opened) return
    if (mode === 'edit' && item) {
      form.setValues({
        naam: item.naam,
        klant: item.klant ?? '',
        tekening: item.tekening ?? '',
        rev: item.rev ?? '',
        locatie: item.locatie ?? '',
        currentStock: item.currentStock,
        minStock: item.minStock ?? '',
        maxStock: item.maxStock ?? '',
        gradeId: item.recipe?.gradeId ?? '',
        profileId: item.recipe?.profileId ?? '',
        dimensions: item.recipe ? { ...item.recipe.dimensions } : {},
        lengthPerPieceMm: item.recipe?.lengthPerPieceMm ?? '',
        operations: item.operations.map(o => o.type),
        workholding: item.notes.workholding,
        general: item.notes.general,
      })
    } else {
      form.setValues(EMPTY)
    }
  }, [opened, item?.id, mode])

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const hasRecipe = !!(v.gradeId && v.profileId)
      const dims = Object.fromEntries(
        Object.entries(v.dimensions).map(([k, val]) => [k, Number(val)])
      )
      const input: ArticleInput = {
        naam: v.naam.trim(),
        klant: v.klant.trim() || null,
        relatieId: item?.relatieId ?? null,
        contactId: item?.contactId ?? null,
        tekening: v.tekening.trim() || null,
        rev: v.rev.trim() || null,
        drawingPath: item?.drawingPath ?? null,
        photoPath: item?.photoPath ?? null,
        recipe: hasRecipe
          ? { gradeId: v.gradeId, profileId: v.profileId, dimensions: dims, lengthPerPieceMm: Number(v.lengthPerPieceMm) || 0 }
          : null,
        operations: v.operations.map((t, i) => ({ id: `op_${i}_${t}`, type: t })),
        notes: { workholding: v.workholding, general: v.general },
        attachments: item?.attachments ?? [], // managed on the detail page; preserve on edit
        estimate: item?.estimate ?? null,      // managed in the calculator; preserve on edit
        locatie: v.locatie.trim() || null,
        currentStock: Number(v.currentStock) || 0,
        minStock: v.minStock !== '' ? Number(v.minStock) : null,
        maxStock: v.maxStock !== '' ? Number(v.maxStock) : null,
      }
      return mode === 'edit' && item ? articlesApi.update(item.id, input) : articlesApi.create(input)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles'] })
      notifications.show({ color: 'green', message: mode === 'add' ? 'Artikel aangemaakt' : 'Artikel bijgewerkt' })
      onClose()
    },
    onError: (e: Error) => notifications.show({ color: 'red', message: e.message }),
  })

  const activeProfile = profiles.find(p => p.id === form.values.profileId)

  const title = mode === 'add' ? 'Artikel toevoegen' : `Bewerken — ${item?.id}`

  return (
    <Modal opened={opened} onClose={onClose} title={title} size={720} centered radius="md">
      <form id="art-form" onSubmit={form.onSubmit(v => mutation.mutate(v))}>
        <Stack gap="sm">
              {mode === 'add' ? (
                <div>
                  <Text size="xs" fw={500} mb={4} c="dimmed">Artikelnummer</Text>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600,
                    padding: '7px 10px', background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {autoNo}
                    <Badge size="xs" variant="light" color="blue" style={{ marginLeft: 'auto' }}>automatisch</Badge>
                  </div>
                </div>
              ) : (
                <TextInput label="Artikelnummer" size="sm" value={item?.id ?? ''} disabled readOnly />
              )}

              <TextInput label="Naam" size="sm" placeholder="bijv. Flens DN50" {...form.getInputProps('naam')} />

              <Group grow>
                <TextInput label="Klant" size="sm" {...form.getInputProps('klant')} />
                <TextInput label="Locatie" size="sm" placeholder="Hal A · Kast 1" {...form.getInputProps('locatie')} />
              </Group>

              <Group grow>
                <TextInput label="Tekening" size="sm" {...form.getInputProps('tekening')} />
                <TextInput label="Revisie" size="sm" {...form.getInputProps('rev')} />
              </Group>

              <Divider label="Voorraad" labelPosition="left" />
              <Group grow>
                <NumberInput label="Huidig" size="sm" min={0} {...form.getInputProps('currentStock')} />
                <NumberInput label="Min." size="sm" min={0} placeholder="—" {...form.getInputProps('minStock')} />
                <NumberInput label="Max." size="sm" min={0} placeholder="—" {...form.getInputProps('maxStock')} />
              </Group>

              <Divider label="Recept (grondstof)" labelPosition="left" />
              <Group grow>
                <Select
                  label="Kwaliteit" placeholder="—" size="sm" clearable
                  data={(gradesData?.data ?? []).map(g => ({ value: g.id, label: g.name }))}
                  value={form.values.gradeId || null}
                  onChange={id => form.setFieldValue('gradeId', id ?? '')}
                />
                <Select
                  label="Profiel" placeholder="—" size="sm" clearable
                  data={profiles.map(p => ({ value: p.id, label: p.name }))}
                  value={form.values.profileId || null}
                  onChange={id => { form.setFieldValue('profileId', id ?? ''); form.setFieldValue('dimensions', {}) }}
                />
              </Group>

              {activeProfile && activeProfile.dimensionSchema.length > 0 && (
                <Group grow>
                  {activeProfile.dimensionSchema.map(field => (
                    <NumberInput
                      key={field.key}
                      label={`${field.label} (${field.unit})`}
                      size="sm" min={0} placeholder="0"
                      value={form.values.dimensions[field.key] ?? ''}
                      onChange={v => form.setFieldValue('dimensions', { ...form.values.dimensions, [field.key]: v })}
                    />
                  ))}
                </Group>
              )}

              {form.values.gradeId && form.values.profileId && (
                <NumberInput
                  label="Lengte per stuk (mm)" size="sm" min={1} placeholder="0"
                  description="Ruwe lengte die één werkstuk verbruikt"
                  {...form.getInputProps('lengthPerPieceMm')}
                />
              )}

              <Divider label="Bewerkingen" labelPosition="left" />
              <MultiSelect
                size="sm" placeholder="Kies bewerkingen…"
                data={KNOWN_OPERATIONS.map(o => ({ value: o.id, label: o.name }))}
                {...form.getInputProps('operations')}
              />

              <Divider label="Setup-notities" labelPosition="left" />
              <Group grow align="flex-start">
                <Textarea label="Opspanning" size="sm" autosize minRows={3} {...form.getInputProps('workholding')} />
                <Textarea label="Algemene notities" size="sm" autosize minRows={3} {...form.getInputProps('general')} />
              </Group>
        </Stack>
      </form>

      <Group justify="flex-end" mt="lg">
        <Button variant="default" size="sm" onClick={onClose}>Annuleren</Button>
        <Button type="submit" form="art-form" size="sm" loading={mutation.isPending}>
          {mode === 'add' ? 'Aanmaken' : 'Opslaan'}
        </Button>
      </Group>
    </Modal>
  )
}
