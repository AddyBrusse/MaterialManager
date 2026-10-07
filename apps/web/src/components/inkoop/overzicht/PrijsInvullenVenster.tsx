import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, Select, Stack, Text } from '@mantine/core'
import type { InkoopOverzichtRegel, Prijsaanvraag } from '@stockmanager/shared'
import { prijsaanvragenApi } from '../../../api/bestellingen'
import { relatiesApi } from '../../../api/relaties'
import { meldFout } from '../../../utils/fout-melding-toon'
import { eis } from '../../../utils/fout-melding'

/**
 * Een prijs die je zonder mail kreeg — aan de telefoon, van de website
 * (2026-10-07). Hij komt als prijsaanvraag op naam, zodat het antwoord en de
 * geschiedenis op dezelfde plek staan als een gemailde; verstuurd wordt er niets.
 */
export function PrijsInvullenVenster({ r, onVerder, onSluit }: {
  r: InkoopOverzichtRegel; onVerder: (a: Prijsaanvraag, leverancierId: string) => void; onSluit: () => void
}) {
  const qc = useQueryClient()
  const { data: relRes } = useQuery({ queryKey: ['relaties'], queryFn: relatiesApi.list })
  const leveranciers = (relRes?.data ?? relatiesApi.listSync())
    .filter((x) => x.actief !== false && (x.type === 'leverancier' || x.type === 'beide'))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  const [lev, setLev] = useState<string | null>(null)
  const maak = useMutation({
    mutationFn: () => {
      eis(lev ? null : 'Kies een leverancier.')
      return prijsaanvragenApi.create({ regelIds: [r.id], leverancierIds: [lev!], notitie: 'Prijs zonder mail (telefoon of website)' })
    },
    onSuccess: (a) => { qc.invalidateQueries({ queryKey: ['prijsaanvragen'] }); onVerder(a, lev!) },
    onError: (e) => meldFout({ actie: `Prijs invullen voor ${r.materiaal}`, fout: e, gevolg: 'Er is niets vastgelegd.' }),
  })
  return (
    <Modal opened onClose={onSluit} title={`Prijs invullen — ${r.materiaal}`} size="sm">
      <Stack gap="xs">
        <Text size="sm">Van welke leverancier? Daarna vul je zijn prijs en levertijd in.</Text>
        <Select size="xs" searchable allowDeselect={false} data={leveranciers.map((l) => ({ value: l.id, label: l.naam }))} value={lev} onChange={setLev} placeholder="Leverancier" />
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onSluit}>Annuleren</Button>
          <Button size="xs" loading={maak.isPending} onClick={() => maak.mutate()}>Verder</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
