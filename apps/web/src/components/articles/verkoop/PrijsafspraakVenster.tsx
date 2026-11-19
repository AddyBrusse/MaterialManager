import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, NumberInput, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { afspraakTekst, waaromNietPrijsafspraak, type Prijsafspraak, type PrijsafspraakInvoer } from '@stockmanager/shared'
import { prijsafsprakenApi } from '../../../api/prijsafspraken'
import { ApiFout } from '../../../api/client'
import { meldFout } from '../../../utils/fout-melding-toon'
import { eis } from '../../../utils/fout-melding'

/**
 * Een prijsafspraak toevoegen of wijzigen (2026-11-18). Dezelfde vraag als de
 * server (`waaromNietPrijsafspraak`) staat al onder de velden, zodat je ziet
 * waarom opslaan niet kan voordat je drukt.
 */
export function PrijsafspraakVenster({ artikelId, bestaand, anderen, onSluit }: {
  artikelId: string
  bestaand?: Prijsafspraak
  /** De andere afspraken van dit artikel: om overlap te zien. */
  anderen: Prijsafspraak[]
  onSluit: () => void
}) {
  const qc = useQueryClient()
  const [prijs, setPrijs] = useState<string | number>(bestaand?.prijs ?? '')
  const [vanaf, setVanaf] = useState<string | number>(bestaand?.vanafAantal ?? 1)
  const [van, setVan] = useState<string | null>(bestaand?.geldigVan ?? null)
  const [tot, setTot] = useState<string | null>(bestaand?.geldigTot ?? null)
  const [kenmerk, setKenmerk] = useState(bestaand?.kenmerk ?? '')

  const invoer: PrijsafspraakInvoer = {
    artikelId, prijs: Number(prijs) || 0, vanafAantal: Number(vanaf) || 0, geldigVan: van, geldigTot: tot,
    kenmerk: kenmerk.trim() || null,
  }
  const fout = prijs === '' ? null : waaromNietPrijsafspraak(invoer, anderen)

  const opslaan = useMutation({
    mutationFn: async () => {
      eis(waaromNietPrijsafspraak(invoer, anderen))
      if (!bestaand) return prijsafsprakenApi.maak(invoer)
      const { artikelId: _, ...patch } = invoer
      return prijsafsprakenApi.wijzig(bestaand.id, patch)
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['prijsafspraken'] })
      notifications.show({ color: 'green', message: `Prijsafspraak opgeslagen: ${afspraakTekst(a)}` })
      onSluit()
    },
    onError: (e) => meldFout({
      actie: bestaand ? 'Prijsafspraak wijzigen' : 'Prijsafspraak toevoegen',
      fout: e,
      gevolg: e instanceof ApiFout && e.code === 'TIMEOUT'
        ? 'Onbekend of de afspraak is opgeslagen: de server antwoordde niet op tijd. Kijk in de lijst voor je het opnieuw doet.'
        : 'Er is niets opgeslagen; wat je invulde staat nog in het venster.',
    }),
  })

  return (
    <Modal opened onClose={onSluit} title={bestaand ? 'Prijsafspraak wijzigen' : 'Prijsafspraak toevoegen'} size="md">
      <Stack gap="xs">
        <SimpleGrid cols={2} spacing="xs">
          <NumberInput size="xs" label="Prijs per stuk (excl. btw)" prefix="€ " decimalSeparator="," thousandSeparator="."
            decimalScale={4} min={0} value={prijs} onChange={setPrijs} data-autofocus />
          <NumberInput size="xs" label="Vanaf aantal" description="Staffel: 1 = altijd" min={1} allowDecimal={false}
            value={vanaf} onChange={setVanaf} />
          <TextInput size="xs" type="date" label="Geldig vanaf" description="Leeg = altijd al"
            value={van ?? ''} onChange={(e) => setVan(e.currentTarget.value || null)} />
          <TextInput size="xs" type="date" label="Geldig tot en met" description="Leeg = onbepaald"
            value={tot ?? ''} onChange={(e) => setTot(e.currentTarget.value || null)} />
        </SimpleGrid>
        <TextInput size="xs" label="Kenmerk" placeholder="Contract 2026, mail van 12-11, prijslijst…" maxLength={200}
          value={kenmerk} onChange={(e) => setKenmerk(e.currentTarget.value)} />
        {fout && <Text size="xs" c="orange.8">{fout}</Text>}
        <Text size="xs" c="dimmed">
          De afspraak vult de prijs voor op een offerte, een directe opdracht en een losse factuur van deze klant. Je kunt
          hem daar altijd overschrijven; wat er op een regel staat, blijft staan als je de afspraak later wijzigt.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onSluit}>Annuleren</Button>
          <Button size="xs" loading={opslaan.isPending} onClick={() => opslaan.mutate()}>Opslaan</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
