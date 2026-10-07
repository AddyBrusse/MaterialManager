import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { waaromNietLeverancierPrijs, type LeverancierPrijs, type LeverancierPrijsInvoer, type PrijsSoort } from '@stockmanager/shared'
import { leverancierPrijzenApi } from '../../api/leverancier-prijzen'
import { relatiesApi } from '../../api/relaties'
import { ApiFout } from '../../api/client'
import { meldFout } from '../../utils/fout-melding-toon'
import { eis } from '../../utils/fout-melding'

export interface DoelKeuze {
  /** Het materiaal waar je vandaan komt; de kwaliteit ervan is de andere keuze. */
  materiaal?: { id: string; gradeId: string; naam: string; gradeNaam: string }
  /** Vanuit de relatie: de leverancier ligt vast, het doel kies je. */
  leverancierId?: string
  materialen?: { value: string; label: string; gradeId: string }[]
  kwaliteiten?: { value: string; label: string }[]
}

type Doel = 'materiaal' | 'kwaliteit'
const getal = (v: string | number) => (v === '' || v == null ? null : Number(v))

/**
 * Een prijs van een leverancier invullen of wijzigen (2026-10-06). Per kg
 * rekent met het gewicht van wat je werkelijk bestelt; per stuk geldt voor
 * één stuk van precies deze maat, en kan dus alleen bij een materiaal.
 */
export function PrijsVenster({ bestaand, keuze, onSluit }: { bestaand?: LeverancierPrijs; keuze: DoelKeuze; onSluit: () => void }) {
  const qc = useQueryClient()
  const { data: relatiesRes } = useQuery({ queryKey: ['relaties'], queryFn: relatiesApi.list })
  const leveranciers = (relatiesRes?.data ?? relatiesApi.listSync())
    .filter((r) => r.type === 'leverancier' || r.type === 'beide')
    .map((r) => ({ value: r.id, label: r.naam }))

  const [leverancierId, setLeverancierId] = useState(bestaand?.leverancierId ?? keuze.leverancierId ?? '')
  const [doel, setDoel] = useState<Doel>(bestaand ? (bestaand.gradeId ? 'kwaliteit' : 'materiaal') : 'materiaal')
  const [doelId, setDoelId] = useState<string>(bestaand?.rawMaterialId ?? bestaand?.gradeId ?? '')
  const [soort, setSoort] = useState<PrijsSoort>(bestaand?.prijsSoort ?? 'per_kg')
  const [prijs, setPrijs] = useState<string | number>(bestaand?.prijs ?? '')
  const [zagen, setZagen] = useState<string | number>(bestaand?.zaagkostenPerSnede ?? '')
  const [minimum, setMinimum] = useState<string | number>(bestaand?.minimumBedrag ?? '')
  const [levertijd, setLevertijd] = useState<string | number>(bestaand?.levertijdDagen ?? '')
  const [notitie, setNotitie] = useState(bestaand?.notitie ?? '')

  const m = keuze.materiaal
  const invoer: LeverancierPrijsInvoer = {
    leverancierId,
    rawMaterialId: doel === 'materiaal' ? (m?.id ?? (doelId || null)) : null,
    gradeId: doel === 'kwaliteit' ? (m?.gradeId ?? (doelId || null)) : null,
    prijsSoort: soort,
    prijs: Number(prijs) || 0,
    zaagkostenPerSnede: getal(zagen), minimumBedrag: getal(minimum), levertijdDagen: getal(levertijd),
    notitie: notitie.trim() || null,
  }
  const regelFout = invoer.rawMaterialId || invoer.gradeId ? waaromNietLeverancierPrijs(invoer) : null

  const opslaan = useMutation({
    mutationFn: async () => {
      eis(!leverancierId ? 'Kies eerst een leverancier.' : null)
      eis(!invoer.rawMaterialId && !invoer.gradeId ? `Kies voor welk${doel === 'materiaal' ? ' materiaal' : 'e kwaliteit'} deze prijs geldt.` : null)
      eis(waaromNietLeverancierPrijs(invoer))
      eis(!(invoer.prijs > 0) ? 'Vul een prijs groter dan 0 in.' : null)
      return bestaand ? leverancierPrijzenApi.update(bestaand.id, invoer) : leverancierPrijzenApi.create(invoer)
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['leverancier-prijzen'] }); qc.invalidateQueries({ queryKey: ['inkoop'] })
      notifications.show({ color: 'green', message: `Prijs van ${p.leverancierNaam} opgeslagen` })
      onSluit()
    },
    onError: (e) =>
      meldFout({
        actie: bestaand ? 'Leveranciersprijs wijzigen' : 'Leveranciersprijs toevoegen',
        fout: e,
        gevolg: e instanceof ApiFout && e.code === 'TIMEOUT'
          ? 'Onbekend of de prijs is opgeslagen: de server antwoordde niet op tijd. Kijk in de lijst voor je het opnieuw doet.'
          : 'Er is niets opgeslagen; wat je invulde staat nog in het venster.',
      }),
  })

  return (
    <Modal opened onClose={onSluit} title={bestaand ? 'Prijs wijzigen' : 'Leverancier koppelen'} size="md">
      <Stack gap="xs">
        <Select
          size="xs" label="Leverancier" searchable data={leveranciers} value={leverancierId || null}
          onChange={(v) => setLeverancierId(v ?? '')} disabled={!!keuze.leverancierId}
          nothingFoundMessage="Geen relatie van type leverancier gevonden"
        />
        <div>
          <Text size="xs" fw={500} mb={4}>Geldt voor</Text>
          <SegmentedControl
            size="xs" value={doel} onChange={(v) => { setDoel(v as Doel); setDoelId('') }}
            data={[
              { value: 'materiaal', label: m ? `Dit materiaal (${m.naam})` : 'Eén materiaal' },
              { value: 'kwaliteit', label: m ? `Hele kwaliteit ${m.gradeNaam}` : 'Hele kwaliteit' },
            ]}
          />
          {!m && (
            <Select
              size="xs" mt={6} searchable placeholder={doel === 'materiaal' ? 'Kies materiaal' : 'Kies kwaliteit'}
              data={doel === 'materiaal' ? (keuze.materialen ?? []) : (keuze.kwaliteiten ?? [])}
              value={doelId || null} onChange={(v) => setDoelId(v ?? '')}
            />
          )}
        </div>
        <div>
          <Text size="xs" fw={500} mb={4}>Prijs als</Text>
          <SegmentedControl
            size="xs" value={soort} onChange={(v) => setSoort(v as PrijsSoort)}
            data={[{ value: 'per_kg', label: 'per kg' }, { value: 'per_stuk', label: 'totaal per stuk' }]}
          />
          {regelFout && <Text size="xs" c="orange.8" mt={4}>{regelFout}</Text>}
          <Text size="xs" c="dimmed" mt={4}>
            {soort === 'per_kg'
              ? 'Rekent met het gewicht van wat je werkelijk bestelt — ook een aangepaste lengte.'
              : 'Voor één stuk van precies deze maat, zagen inbegrepen tenzij je hieronder iets invult.'}
          </Text>
        </div>
        <SimpleGrid cols={2} spacing="xs">
          <NumberInput size="xs" label={soort === 'per_kg' ? 'Prijs per kg' : 'Prijs per stuk'} prefix="€ " decimalSeparator="," thousandSeparator="." decimalScale={2} min={0} value={prijs} onChange={setPrijs} data-autofocus />
          <NumberInput size="xs" label="Zagen per snede" prefix="€ " decimalSeparator="," decimalScale={2} min={0} value={zagen} onChange={setZagen} placeholder="in prijs" />
          <NumberInput size="xs" label="Minimum per bestelling" prefix="€ " decimalSeparator="," decimalScale={2} min={0} value={minimum} onChange={setMinimum} placeholder="geen" />
          <NumberInput size="xs" label="Levertijd (werkdagen)" allowDecimal={false} min={0} value={levertijd} onChange={setLevertijd} />
        </SimpleGrid>
        <Textarea size="xs" label="Notitie" autosize minRows={1} value={notitie} onChange={(e) => setNotitie(e.currentTarget.value)} />
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onSluit}>Annuleren</Button>
          <Button size="xs" loading={opslaan.isPending} onClick={() => opslaan.mutate()}>Opslaan</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
