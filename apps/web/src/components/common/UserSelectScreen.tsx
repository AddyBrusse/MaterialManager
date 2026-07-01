import { useState } from 'react'
import { Center, Stack, Title, Select, Button, Paper, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useUserStore } from '../../stores/user'
import { usersApi } from '../../api/users'
import type { User } from '@stockmanager/shared'

export function UserSelectScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const setUser = useUserStore((s) => s.setUser)

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  })

  const users: User[] = data?.data ?? []

  function handleConfirm() {
    const user = users.find((u) => u.id === selectedId)
    if (user) setUser({
      id: user.id, name: user.name, role: user.role as 'admin' | 'user',
      email: user.email, achternaam: user.achternaam, titel: user.titel,
    })
  }

  return (
    <Center h="100vh" bg="gray.0">
      <Paper p="xl" shadow="sm" w={320}>
        <Stack gap="md">
          <Title order={3}>StockManager</Title>
          <Text size="sm" c="dimmed">Selecteer wie je bent</Text>
          <Select
            placeholder="Kies gebruiker..."
            data={users.map((u) => ({ value: u.id, label: u.name }))}
            value={selectedId}
            onChange={setSelectedId}
            disabled={isLoading}
            size="sm"
            searchable
          />
          <Button onClick={handleConfirm} disabled={!selectedId} size="sm">
            Doorgaan
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}
