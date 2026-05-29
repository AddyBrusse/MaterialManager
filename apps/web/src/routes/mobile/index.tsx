import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AppShell, Group, ActionIcon, Text, SegmentedControl } from '@mantine/core'
import { IconPackage, IconBox, IconArrowsExchange } from '@tabler/icons-react'
import { useUserStore } from '../../stores/user'

function MobileBottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <AppShell.Footer p="xs">
      <SegmentedControl
        fullWidth
        size="xs"
        value={pathname.split('/')[1] || 'raw'}
        onChange={(v) => navigate(`/${v}`)}
        data={[
          { value: 'raw', label: <Group gap={4}><IconPackage size={14} /><Text size="xs">Grondstof</Text></Group> },
          { value: 'finished', label: <Group gap={4}><IconBox size={14} /><Text size="xs">Artikel</Text></Group> },
          { value: 'movements', label: <Group gap={4}><IconArrowsExchange size={14} /><Text size="xs">Mutaties</Text></Group> },
        ]}
      />
    </AppShell.Footer>
  )
}

export function MobileLayout() {
  const { user } = useUserStore()

  return (
    <AppShell footer={{ height: 56 }}>
      <AppShell.Header p="xs" h={44}>
        <Group justify="space-between">
          <Text fw={600} size="sm">StockManager</Text>
          <Text size="xs" c="dimmed">{user?.name}</Text>
        </Group>
      </AppShell.Header>
      <AppShell.Main pt={44}>
        <Routes>
          <Route index element={<Navigate to="/raw" replace />} />
          <Route path="/raw" element={<div>Grondstoffen — nog te bouwen</div>} />
          <Route path="/finished" element={<div>Eindproducten — nog te bouwen</div>} />
          <Route path="/movements" element={<div>Mutaties — nog te bouwen</div>} />
          <Route path="*" element={<Navigate to="/raw" replace />} />
        </Routes>
      </AppShell.Main>
      <MobileBottomNav />
    </AppShell>
  )
}
