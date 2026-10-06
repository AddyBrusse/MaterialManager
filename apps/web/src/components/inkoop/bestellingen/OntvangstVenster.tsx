import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, NumberInput, Select, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { openStuks, waaromNietOntvangen, type Inkooporder, type InkooporderRegel } from '@stockmanager/shared'
import { inkoopordersApi, INKOOP_SLEUTELS } from '../../../api/inkooporders'
import { locationsApi } from '../../../api/locations'
import { ApiFout } from '../../../api/client'
import { meldFout } from '../../../utils/fout-melding-toon'
import { eis } from '../../../utils/fout-melding'
import { mm } from './bestel-tekst'

/**
 * Iets binnen van een inkooporder (2026-10-06): hoeveel stuks, en waar ze
 * komen te liggen (mag leeg blijven). Elk stuk wordt een regel in de
 * materiaallijst; een exoot gaat meteen vast voor zijn project.
 */
export function OntvangstVenster({ order, regel, onSluit }: { order: Inkooporder; regel: InkooporderRegel; onSluit: () => void }) {
  const qc = useQueryClient()
  const open = openStuks(regel)
  const [stuks, setStuks] = useState<number | string>(open)
  const [slot, setSlot] = useState<string | null>(null)
  const [notitie, setNotitie] = useState('')
  const { data: loc } = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list })
  const slots = (loc?.data ?? []).map((l) => ({
    group: l.label,
    items: l.slots.map((s) => ({ value: s.id, label: s.level2 ? `${s.level1} · ${s.level2}` : s.level1 })),
  }))

  const ontvang = useMutation({
    mutationFn: () => {
      eis(waaromNietOntvangen(order, regel, Number(stuks)))
      return inkoopordersApi.ontvang({ inkooporderRegelId: regel.id, stuks: Number(stuks), locationSlotId: slot, notitie: notitie.trim() || null })
    },
    onSuccess: (o) => {
      for (const k of INKOOP_SLEUTELS) qc.invalidateQueries({ queryKey: [k] })
      notifications.show({
        color: 'green',
        message: `${o.stuks} × ${o.materiaal} in de voorraad (${o.codes.join(', ')})${o.gereserveerdVoor ? `, gereserveerd voor ${o.gereserveerdVoor}` : ''}`,
      })
      onSluit()
    },
    onError: (e) => meldFout({
      actie: `${regel.referentie} ontvangen`,
      fout: e,
      gevolg: e instanceof ApiFout && e.code === 'TIMEOUT'
        ? 'Onbekend of het in de voorraad staat. Kijk bij Ontvangen of in de voorraad voor je het opnieuw doet.'
        : 'Er is niets in de voorraad gezet.',
    }),
  })

  return (
    <Modal opened onClose={onSluit} title={`Ontvangen — ${regel.referentie}`} size="md">
      <Stack gap="xs">
        <Text size="sm"><b>{regel.materiaal}</b> · {regel.stuks} × {mm(regel.lengteMm)} · nog {open} open</Text>
        <NumberInput size="xs" label="Stuks binnen" min={1} max={open} allowDecimal={false} value={stuks} onChange={setStuks} data-autofocus />
        <Select size="xs" label="Locatie" placeholder="later invullen" clearable searchable data={slots} value={slot} onChange={setSlot} />
        <Textarea size="xs" label="Notitie" autosize minRows={1} placeholder="bijv. pakbonnummer van de leverancier" value={notitie} onChange={(e) => setNotitie(e.currentTarget.value)} />
        <Text size="xs" c="dimmed">
          Elk stuk komt als eigen regel in de materiaallijst, met een mutatie "ontvangen".
          {regel.exoot && regel.projectId ? ` Een exoot gaat meteen vast voor ${regel.projectId}.` : ''}
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onSluit}>Annuleren</Button>
          <Button size="xs" color="green" loading={ontvang.isPending} onClick={() => ontvang.mutate()}>In de voorraad</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
