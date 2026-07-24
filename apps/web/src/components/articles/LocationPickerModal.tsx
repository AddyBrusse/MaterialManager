import { Modal, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { locationsApi } from '../../api/locations'
import type { LocationWithSlots } from '../../api/locations'
import './article-pickers.css'

interface LocationPickerModalProps {
  opened: boolean
  onClose: () => void
  currentLocationLabel: string | null
  onPick: (label: string) => void
}

const GRID = '92px 1fr 96px 76px'

const KIND_LABEL: Record<string, string> = {
  rack: 'Stelling',
  cabinet: 'Kast',
}

export function LocationPickerModal({
  opened, onClose, currentLocationLabel, onPick,
}: LocationPickerModalProps) {
  const { data } = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list })
  const locations: LocationWithSlots[] = data?.data ?? []

  function choose(loc: LocationWithSlots) {
    onPick(loc.label)
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={620}
      radius="md"
      centered
      title="Opslaglocatie kiezen"
      styles={{ title: { fontWeight: 600 } }}
    >
      <div className="apk-table-head" style={{ gridTemplateColumns: GRID }}>
        <span>Locatie</span>
        <span>Omschrijving</span>
        <span>Type</span>
        <span className="apk-right">Bezetting</span>
      </div>

      {locations.length === 0 ? (
        <div className="apk-empty">Geen locaties gevonden.</div>
      ) : (
        <div className="apk-loc-rows">
          {locations.map(loc => {
            const selected = currentLocationLabel === loc.label
            const slotCount = loc.slots.length
            return (
              <div
                key={loc.id}
                className={`apk-row apk-row-click${selected ? ' apk-row-selected' : ''}`}
                style={{ gridTemplateColumns: GRID }}
                onClick={() => choose(loc)}
              >
                <Text
                  size="xs"
                  className="apk-mono"
                  style={selected ? { color: 'var(--accent)', fontWeight: 600 } : undefined}
                >
                  {loc.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {slotCount} {slotCount === 1 ? 'vak' : 'vakken'}
                </Text>
                <Text size="xs" c="dimmed">{KIND_LABEL[loc.kind] ?? loc.kind}</Text>
                <Text size="xs" className="apk-mono apk-right" c="dimmed">—</Text>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
