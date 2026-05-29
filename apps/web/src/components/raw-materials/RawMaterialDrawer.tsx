import { Drawer, Stack, Group, Badge, Text, SimpleGrid, Divider, Image, Anchor } from '@mantine/core'
import type { RawMaterialRow } from '../../api/raw-materials'
import { formatDimensions, formatLocation } from '../../api/raw-materials'

type Props = {
  item: RawMaterialRow | null
  onClose: () => void
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm">{value}</Text>
    </Stack>
  )
}

export function RawMaterialDrawer({ item, onClose }: Props) {
  return (
    <Drawer
      opened={!!item}
      onClose={onClose}
      position="right"
      size="md"
      title={
        item && (
          <Group gap="xs">
            <Text fw={700} ff="monospace">{item.code}</Text>
            <Badge size="sm" variant="light">{item.grade.name}</Badge>
          </Group>
        )
      }
      padding="md"
    >
      {item && (
        <Stack gap="md">
          {item.photoPath && (
            <Image
              src={`/uploads/${item.photoPath}`}
              alt={item.code}
              radius="sm"
              mah={200}
              fit="contain"
            />
          )}

          <SimpleGrid cols={2} spacing="sm">
            <Field label="Profiel" value={item.profile.name} />
            <Field label="Afmetingen" value={formatDimensions(item.profile, item.dimensions)} />
            <Field label="Lengte" value={`${Number(item.lengthMm).toLocaleString('nl-NL')} mm`} />
            <Field label="Gewicht" value={`${item.weightKg.toFixed(3)} kg`} />
          </SimpleGrid>

          <Divider />

          <SimpleGrid cols={2} spacing="sm">
            <Field label="Locatie" value={formatLocation(item.locationSlot)} />
            <Field label="Huidige voorraad" value={Number(item.currentStock)} />
            {item.minStock !== null && (
              <Field label="Min. voorraad" value={Number(item.minStock)} />
            )}
          </SimpleGrid>

          <Divider />

          <SimpleGrid cols={2} spacing="sm">
            <Field
              label="Aangemaakt"
              value={new Date(item.createdAt).toLocaleDateString('nl-NL')}
            />
            <Field
              label="Bijgewerkt"
              value={new Date(item.updatedAt).toLocaleDateString('nl-NL')}
            />
          </SimpleGrid>

          {item.photoPath && (
            <Anchor size="xs" href={`/uploads/${item.photoPath}`} target="_blank">
              Foto openen
            </Anchor>
          )}
        </Stack>
      )}
    </Drawer>
  )
}
