import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, NumberInput, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { articlesApi } from '../../../api/articles'
import { ApiFout } from '../../../api/client'
import { meldFout } from '../../../utils/fout-melding-toon'
import { eis } from '../../../utils/fout-melding'

/** De vrije voorraad tellen: de stand wordt wat er geteld is, het verschil gaat met reden in het logboek. */
export function TelVenster({ artikelId, huidig, onSluit }: { artikelId: string; huidig: number; onSluit: () => void }) {
  const qc = useQueryClient()
  const [stand, setStand] = useState<string | number>(huidig)
  const [reden, setReden] = useState('Geteld')
  const verschil = (Number(stand) || 0) - huidig

  const opslaan = useMutation({
    mutationFn: async () => {
      eis(stand === '' || Number(stand) < 0 ? 'Vul in hoeveel er ligt (0 of meer).' : null)
      eis(reden.trim().length < 3 ? 'Zeg waarom: "geteld", "kapot", "extra gemaakt".' : null)
      return articlesApi.tel(artikelId, { stand: Number(stand), reden: reden.trim() })
    },
    onSuccess: (v) => {
      qc.setQueryData(['artikel-voorraad', artikelId], v)
      qc.invalidateQueries({ queryKey: ['article', artikelId] })
      qc.invalidateQueries({ queryKey: ['articles'] })
      notifications.show({ color: 'green', message: `Voorraad staat op ${v.vrij}` })
      onSluit()
    },
    onError: (e) => meldFout({
      actie: 'Voorraad tellen', fout: e,
      gevolg: e instanceof ApiFout && e.code === 'TIMEOUT'
        ? 'Onbekend of de telling is opgeslagen: de server antwoordde niet op tijd. Kijk in het logboek voor je het opnieuw doet.'
        : 'De voorraad is niet gewijzigd; wat je invulde staat nog in het venster.',
    }),
  })

  return (
    <Modal opened onClose={onSluit} title="Voorraad tellen" size="sm">
      <Stack gap="xs">
        <NumberInput size="xs" label="Vrij op voorraad (stuks)" min={0} decimalSeparator="," value={stand} onChange={setStand} data-autofocus />
        <TextInput size="xs" label="Reden" maxLength={300} value={reden} onChange={(e) => setReden(e.currentTarget.value)} />
        <Text size="xs" c="dimmed">
          Nu {huidig}. {verschil === 0 ? 'Geen verschil: de telling komt wel in het logboek.' : `Verschil ${verschil > 0 ? '+' : ''}${verschil}.`}
          {' '}Tel alleen wat vrij ligt: stuks die al voor een order gereedgemeld zijn, tellen niet mee.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onSluit}>Annuleren</Button>
          <Button size="xs" loading={opslaan.isPending} onClick={() => opslaan.mutate()}>Opslaan</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
