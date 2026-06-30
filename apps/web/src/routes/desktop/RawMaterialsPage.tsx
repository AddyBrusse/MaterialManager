import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ScrollArea, TextInput, Select, Group, Button, Table, Text, Badge,
  Center, UnstyledButton, ActionIcon, Tooltip, Loader, Stack,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconChevronUp, IconChevronDown, IconSelector,
  IconEdit, IconTrash, IconPlus,
} from '@tabler/icons-react'
import classes from './TableSort.module.css'
import { rawMaterialsApi, formatDimensions, formatLocation } from '../../api/raw-materials'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { reservationsStore } from '../../api/reservations'
import { RawMaterialDrawer } from '../../components/raw-materials/RawMaterialDrawer'
import { RawMaterialForm } from '../../components/raw-materials/RawMaterialForm'
import type { RawMaterialRow } from '../../api/raw-materials'

// ── mock data (shown when the database is empty) ──────────────────────────────
const MOCK: RawMaterialRow[] = [
  { id: 'm1', code: '#00001', gradeId: 'g1', profileId: 'p1', surfaceFinishId: null, dimensions: { diameter: 50 }, lengthMm: '2000', currentStock: '3', minStock: '2', photoPath: null, weightKg: 30.84, createdAt: '2026-01-10T08:00:00Z', updatedAt: '2026-01-10T08:00:00Z', grade: { id: 'g1', name: 'S355', densityKgM3: '7850', createdAt: '' }, profile: { id: 'p1', name: 'Rond', dimensionSchema: [], volumeFormula: 'round', createdAt: '' }, surfaceFinish: null, locationSlot: { id: 's1', level1: 'R1', level2: null, location: { id: 'l1', kind: 'rack', label: 'Rack A' } } },
  { id: 'm2', code: '#00002', gradeId: 'g1', profileId: 'p1', surfaceFinishId: null, dimensions: { diameter: 30 }, lengthMm: '1500', currentStock: '5', minStock: null, photoPath: null, weightKg: 8.31, createdAt: '2026-01-11T08:00:00Z', updatedAt: '2026-01-11T08:00:00Z', grade: { id: 'g1', name: 'S355', densityKgM3: '7850', createdAt: '' }, profile: { id: 'p1', name: 'Rond', dimensionSchema: [], volumeFormula: 'round', createdAt: '' }, surfaceFinish: null, locationSlot: { id: 's2', level1: 'R2', level2: null, location: { id: 'l1', kind: 'rack', label: 'Rack A' } } },
  { id: 'm3', code: '#00003', gradeId: 'g2', profileId: 'p2', surfaceFinishId: null, dimensions: { width: 40, height: 10 }, lengthMm: '3000', currentStock: '2', minStock: null, photoPath: null, weightKg: 9.42, createdAt: '2026-01-12T08:00:00Z', updatedAt: '2026-01-12T08:00:00Z', grade: { id: 'g2', name: 'S235', densityKgM3: '7850', createdAt: '' }, profile: { id: 'p2', name: 'Plat', dimensionSchema: [], volumeFormula: 'flat', createdAt: '' }, surfaceFinish: null, locationSlot: { id: 's3', level1: 'R3', level2: null, location: { id: 'l2', kind: 'rack', label: 'Rack B' } } },
  { id: 'm4', code: '#00004', gradeId: 'g1', profileId: 'p3', surfaceFinishId: null, dimensions: { outerDiameter: 60.3, innerDiameter: 51.3 }, lengthMm: '2500', currentStock: '1', minStock: '1', photoPath: null, weightKg: 16.72, createdAt: '2026-01-13T08:00:00Z', updatedAt: '2026-01-13T08:00:00Z', grade: { id: 'g1', name: 'S355', densityKgM3: '7850', createdAt: '' }, profile: { id: 'p3', name: 'Buis', dimensionSchema: [], volumeFormula: 'tube', createdAt: '' }, surfaceFinish: null, locationSlot: { id: 's4', level1: 'R1', level2: 'V2', location: { id: 'l1', kind: 'rack', label: 'Rack A' } } },
  { id: 'm5', code: '#00005', gradeId: 'g1', profileId: 'p4', surfaceFinishId: null, dimensions: { side: 25 }, lengthMm: '1000', currentStock: '8', minStock: '5', photoPath: null, weightKg: 4.91, createdAt: '2026-01-14T08:00:00Z', updatedAt: '2026-01-14T08:00:00Z', grade: { id: 'g1', name: 'S355', densityKgM3: '7850', createdAt: '' }, profile: { id: 'p4', name: 'Vierkant', dimensionSchema: [], volumeFormula: 'square', createdAt: '' }, surfaceFinish: null, locationSlot: { id: 's5', level1: 'R1', level2: null, location: { id: 'l2', kind: 'rack', label: 'Rack B' } } },
  { id: 'm6', code: '#00006', gradeId: 'g2', profileId: 'p1', surfaceFinishId: null, dimensions: { diameter: 80 }, lengthMm: '500', currentStock: '1', minStock: null, photoPath: null, weightKg: 19.73, createdAt: '2026-01-15T08:00:00Z', updatedAt: '2026-01-15T08:00:00Z', grade: { id: 'g2', name: 'S235', densityKgM3: '7850', createdAt: '' }, profile: { id: 'p1', name: 'Rond', dimensionSchema: [], volumeFormula: 'round', createdAt: '' }, surfaceFinish: null, locationSlot: { id: 's6', level1: 'R3', level2: null, location: { id: 'l1', kind: 'rack', label: 'Rack A' } } },
  { id: 'm7', code: '#00007', gradeId: 'g2', profileId: 'p2', surfaceFinishId: null, dimensions: { width: 60, height: 20 }, lengthMm: '2000', currentStock: '4', minStock: '2', photoPath: null, weightKg: 18.84, createdAt: '2026-01-16T08:00:00Z', updatedAt: '2026-01-16T08:00:00Z', grade: { id: 'g2', name: 'S235', densityKgM3: '7850', createdAt: '' }, profile: { id: 'p2', name: 'Plat', dimensionSchema: [], volumeFormula: 'flat', createdAt: '' }, surfaceFinish: null, locationSlot: { id: 's7', level1: 'R2', level2: null, location: { id: 'l2', kind: 'rack', label: 'Rack B' } } },
]

// ── sort helpers ──────────────────────────────────────────────────────────────
type SortKey = 'code' | 'grade' | 'profile' | 'dimensions' | 'lengthMm' | 'weightKg' | 'location' | 'currentStock' | 'reserved'

function sortValue(row: RawMaterialRow, key: SortKey, reservedByBar: Record<string, number>): string | number {
  switch (key) {
    case 'code':        return row.code
    case 'grade':       return row.grade.name
    case 'profile':     return row.profile.name
    case 'dimensions':  return formatDimensions(row.profile, row.dimensions)
    case 'lengthMm':    return Number(row.lengthMm)
    case 'weightKg':    return row.weightKg
    case 'location':    return formatLocation(row.locationSlot)
    case 'currentStock': return Number(row.currentStock)
    case 'reserved':    return reservedByBar[row.id] ?? 0
  }
}

function applySort(data: RawMaterialRow[], sortBy: SortKey | null, reversed: boolean, reservedByBar: Record<string, number>) {
  if (!sortBy) return data
  return [...data].sort((a, b) => {
    const va = sortValue(a, sortBy, reservedByBar)
    const vb = sortValue(b, sortBy, reservedByBar)
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'nl')
    return reversed ? -cmp : cmp
  })
}

// ── sortable header ───────────────────────────────────────────────────────────
function Th({ children, sortKey, sortBy, reversed, onSort }: {
  children: React.ReactNode
  sortKey: SortKey
  sortBy: SortKey | null
  reversed: boolean
  onSort: (k: SortKey) => void
}) {
  const active = sortBy === sortKey
  const Icon = active ? (reversed ? IconChevronUp : IconChevronDown) : IconSelector
  return (
    <Table.Th className={classes.th}>
      <UnstyledButton onClick={() => onSort(sortKey)} className={classes.control}>
        <Group justify="space-between" wrap="nowrap">
          <Text fw={500} fz="xs">{children}</Text>
          <Center className={classes.icon}>
            <Icon size={14} stroke={1.5} />
          </Center>
        </Group>
      </UnstyledButton>
    </Table.Th>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────
export function RawMaterialsPage() {
  const qc = useQueryClient()

  const [codeSearch, setCodeSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState<string | null>(null)
  const [profileFilter, setProfileFilter] = useState<string | null>(null)
  const [sizeFilter, setSizeFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortKey | null>('code')
  const [reversed, setReversed] = useState(false)
  const [selected, setSelected] = useState<RawMaterialRow | null>(null)
  const [addOpen, setAddOpen]   = useState(false)
  const [editItem, setEditItem] = useState<RawMaterialRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['raw-materials'],
    queryFn: rawMaterialsApi.list,
  })
  const { data: gradesData } = useQuery({ queryKey: ['grades'], queryFn: gradesApi.list })
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })

  // Reserved mm per bar from open/in-progress zaag reservations.
  const [allReservations] = useState(() => reservationsStore.list())
  const reservedByBar = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of allReservations) {
      if (r.status !== 'done') map[r.barId] = (map[r.barId] ?? 0) + r.sawLength
    }
    return map
  }, [allReservations])

  const deleteMutation = useMutation({
    mutationFn: rawMaterialsApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      notifications.show({ color: 'green', message: 'Materiaal verwijderd' })
    },
    onError: () => notifications.show({ color: 'red', message: 'Verwijderen mislukt' }),
  })

  const source = data?.data?.length ? data.data : MOCK

  const rows = useMemo(() => {
    let items = source
    if (codeSearch.trim())  items = items.filter(r => r.code.toLowerCase().includes(codeSearch.toLowerCase()))
    if (gradeFilter)        items = items.filter(r => r.gradeId === gradeFilter || r.grade.name === gradeFilter)
    if (profileFilter)      items = items.filter(r => r.profileId === profileFilter || r.profile.name === profileFilter)
    if (sizeFilter.trim())  items = items.filter(r => formatDimensions(r.profile, r.dimensions).toLowerCase().includes(sizeFilter.toLowerCase()))
    return applySort(items, sortBy, reversed, reservedByBar)
  }, [source, codeSearch, gradeFilter, profileFilter, sizeFilter, sortBy, reversed, reservedByBar])

  function handleSort(key: SortKey) {
    setReversed(sortBy === key ? !reversed : false)
    setSortBy(key)
  }

  function handleDelete(row: RawMaterialRow) {
    if (!window.confirm(`Materiaal ${row.code} verwijderen?`)) return
    deleteMutation.mutate(row.id)
  }

  const gradeOptions  = (gradesData?.data ?? []).map(g => ({ value: g.id, label: g.name }))
  const profileOptions = (profilesData?.data ?? []).map(p => ({ value: p.id, label: p.name }))

  const thProps = { sortBy, reversed, onSort: handleSort }

  return (
    <>
      <Stack gap="sm" p="md">
        {/* toolbar */}
        <Group justify="space-between">
          <Group gap="xs">
            <TextInput placeholder="Code…"     leftSection={<IconSearch size={13} />} value={codeSearch}   onChange={e => setCodeSearch(e.currentTarget.value)}   w={130} />
            <Select placeholder="Grade"        data={gradeOptions}   value={gradeFilter}   onChange={setGradeFilter}   w={110} clearable />
            <Select placeholder="Profiel"      data={profileOptions} value={profileFilter} onChange={setProfileFilter} w={110} clearable />
            <TextInput placeholder="Afmeting…" leftSection={<IconSearch size={13} />} value={sizeFilter}    onChange={e => setSizeFilter(e.currentTarget.value)}    w={120} />
            <Text size="xs" c="dimmed">{rows.length} stuks</Text>
          </Group>
          <Button leftSection={<IconPlus size={14} />} onClick={() => setAddOpen(true)}>
            Toevoegen
          </Button>
        </Group>

        {/* table */}
        {isLoading ? (
          <Center py="xl"><Loader size="sm" /></Center>
        ) : (
          <ScrollArea>
            <Table miw={980} verticalSpacing={3} fz="xs" layout="fixed">
              <Table.Thead>
                <Table.Tr>
                  <Th sortKey="code"         {...thProps}>Code</Th>
                  <Th sortKey="grade"        {...thProps}>Grade</Th>
                  <Th sortKey="profile"      {...thProps}>Profiel</Th>
                  <Th sortKey="dimensions"   {...thProps}>Afmeting</Th>
                  <Th sortKey="lengthMm"     {...thProps}>Lengte (mm)</Th>
                  <Th sortKey="weightKg"     {...thProps}>Gewicht (kg)</Th>
                  <Th sortKey="location"     {...thProps}>Locatie</Th>
                  <Th sortKey="currentStock" {...thProps}>Fysiek (mm)</Th>
                  <Th sortKey="reserved"     {...thProps}>Gereserveerd (mm)</Th>
                  <Table.Th style={{ width: 64 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={10}>
                      <Text ta="center" c="dimmed" py="md" fz="xs">Geen grondstoffen gevonden</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : rows.map(row => {
                  const reserved = reservedByBar[row.id] ?? 0
                  const fysiek   = Number(row.currentStock)
                  return (
                  <Table.Tr key={row.id} onClick={() => setSelected(row)} style={{ cursor: 'pointer' }}>
                    <Table.Td><Text fz="xs" ff="monospace" fw={600}>{row.code}</Text></Table.Td>
                    <Table.Td><Badge variant="light">{row.grade.name}</Badge></Table.Td>
                    <Table.Td>{row.profile.name}</Table.Td>
                    <Table.Td>{formatDimensions(row.profile, row.dimensions)}</Table.Td>
                    <Table.Td ta="right">{Number(row.lengthMm).toLocaleString('nl-NL')}</Table.Td>
                    <Table.Td ta="right">{row.weightKg.toFixed(3)}</Table.Td>
                    <Table.Td>{formatLocation(row.locationSlot)}</Table.Td>
                    <Table.Td ta="right">
                      <Text fz="xs" ff="monospace">{fysiek.toLocaleString('nl-NL')}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      {reserved > 0 ? (
                        <Text fz="xs" ff="monospace" c="orange.7" fw={600}>
                          {reserved.toLocaleString('nl-NL')}
                        </Text>
                      ) : (
                        <Text fz="xs" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="center" onClick={e => e.stopPropagation()}>
                        <Tooltip label="Bewerken">
                          <ActionIcon size="xs" variant="subtle"
                            onClick={() => setEditItem(row)}>
                            <IconEdit size={13} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Verwijderen">
                          <ActionIcon size="xs" variant="subtle" color="red"
                            onClick={() => handleDelete(row)}
                            loading={deleteMutation.isPending}>
                            <IconTrash size={13} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Stack>

      <RawMaterialDrawer item={selected} onClose={() => setSelected(null)} />

      <RawMaterialForm
        mode="add"
        opened={addOpen}
        onClose={() => setAddOpen(false)}
      />
      <RawMaterialForm
        mode="edit"
        item={editItem ?? undefined}
        opened={!!editItem}
        onClose={() => setEditItem(null)}
      />
    </>
  )
}
