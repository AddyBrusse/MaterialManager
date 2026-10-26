import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { rawMaterialsApi, computeWeightKg, volgendeVoorraadCode, type ProfileInfo, type RawMaterialRow } from '../../api/raw-materials'
import { relatiesApi } from '../../api/relaties'
import { ApiFout } from '../../api/client'
import { meldFout } from '../../utils/fout-melding-toon'
import { eis } from '../../utils/fout-melding'
import { bestaandeExoot } from './bestaande-exoot'

const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const kg = (n: number) => `${n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} kg`

interface Props {
  grades: { id: string; name: string; densityKgM3: number | string; pricePerKg?: number }[]
  profiles: ProfileInfo[]
  stockRows: RawMaterialRow[]
  artikel: { id: string; naam: string; relatieId: string | null }
  onGemaakt: (row: RawMaterialRow, stuksUitEen: number) => void
  onSluit: () => void
}

/**
 * Een exoot aanmaken vanuit de calculatie (2026-10-06): materiaal buiten het
 * vaste assortiment, op maat gezaagd door de leverancier, voor één klant. Komt
 * in de materiaallijst met voorraad 0 — hij komt binnen via de inkooporder.
 */
export function ExootVenster({ grades, profiles, stockRows, artikel, onGemaakt, onSluit }: Props) {
  const qc = useQueryClient()
  const { data: relRes } = useQuery({ queryKey: ['relaties'], queryFn: relatiesApi.list })
  const klanten = (relRes?.data ?? relatiesApi.listSync())
    .filter((r) => r.type === 'klant' || r.type === 'beide')
    .map((r) => ({ value: r.id, label: r.naam }))

  const [gradeId, setGradeId] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(profiles.find((p) => p.volumeFormula === 'flat')?.id ?? null)
  const [dims, setDims] = useState<Record<string, number | string>>({})
  const [lengte, setLengte] = useState<number | string>('')
  const [klantId, setKlantId] = useState<string | null>(artikel.relatieId)
  const [stuks, setStuks] = useState<number | string>(1)

  const profiel = profiles.find((p) => p.id === profileId)
  const grade = grades.find((g) => g.id === gradeId)
  const maten = Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, Number(v) || 0]))
  const compleet = !!profiel && profiel.dimensionSchema.every((d) => maten[d.key] > 0) && Number(lengte) > 0
  const gewicht = compleet && grade ? computeWeightKg(profiel!.volumeFormula, maten, Number(lengte), Number(grade.densityKgM3)) : 0
  const perExoot = gewicht * (grade?.pricePerKg ?? 0)
  const n = Math.max(1, Math.floor(Number(stuks) || 1))
  const bestaand = compleet ? bestaandeExoot(stockRows, { klantId, gradeId, profileId, maten, lengte: Number(lengte), artikelId: artikel.id }) : undefined
  const gebruikBestaand = (row: RawMaterialRow) => {
    notifications.show({ color: 'green', message: `Bestaande exoot ${row.code} gebruikt` })
    onGemaakt(row, n)
  }

  const maak = useMutation({
    mutationFn: async () => {
      eis(!gradeId ? 'Kies een kwaliteit.' : null)
      eis(!profiel ? 'Kies een vorm.' : null)
      eis(!compleet ? 'Vul alle maten en de lengte in, groter dan 0.' : null)
      eis(!klantId ? 'Kies de klant: een exoot is voor één klant.' : null)
      const r = await rawMaterialsApi.create({
        code: volgendeVoorraadCode(stockRows), gradeId: gradeId!, profileId: profileId!, dimensions: maten,
        lengthMm: Number(lengte), exoot: true, klantId, artikelId: artikel.id,
      })
      return r.data
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      notifications.show({ color: 'green', message: `Exoot ${row.code} aangemaakt in de materiaallijst` })
      onGemaakt(row, n)
    },
    onError: (e) =>
      meldFout({
        actie: 'Exoot aanmaken',
        fout: e,
        gevolg: e instanceof ApiFout && e.code === 'TIMEOUT'
          ? 'Onbekend of de exoot is aangemaakt: de server antwoordde niet op tijd. Kijk in de materiaallijst voor je het opnieuw doet.'
          : 'Er is geen exoot aangemaakt en de calculatie is niet veranderd.',
      }),
  })

  return (
    <Modal opened onClose={onSluit} title="Exoot aanmaken" size="md">
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Materiaal buiten het vaste assortiment, op maat gezaagd door de leverancier. Komt in de materiaallijst als exoot, voor deze klant.
        </Text>
        <SimpleGrid cols={2} spacing="xs">
          <Select size="xs" label="Kwaliteit" searchable data={grades.map((g) => ({ value: g.id, label: g.name }))} value={gradeId} onChange={setGradeId} data-autofocus />
          <Select size="xs" label="Vorm" allowDeselect={false} data={profiles.map((p) => ({ value: p.id, label: p.name }))} value={profileId} onChange={(v) => { setProfileId(v); setDims({}) }} />
        </SimpleGrid>
        <SimpleGrid cols={3} spacing="xs">
          {profiel?.dimensionSchema.map((d) => (
            <NumberInput key={d.key} size="xs" label={`${d.label} (${d.unit || 'mm'})`} min={0} decimalSeparator="," value={dims[d.key] ?? ''} onChange={(v) => setDims((o) => ({ ...o, [d.key]: v }))} />
          ))}
          <NumberInput size="xs" label="Lengte (mm)" min={0} decimalSeparator="," value={lengte} onChange={setLengte} />
        </SimpleGrid>
        <SimpleGrid cols={2} spacing="xs">
          <Select size="xs" label="Klant" searchable data={klanten} value={klantId} onChange={setKlantId} nothingFoundMessage="Geen klant gevonden" />
          <NumberInput size="xs" label="Stuks uit één exoot" min={1} allowDecimal={false} value={stuks} onChange={setStuks} />
        </SimpleGrid>
        <div className="acalc-exoot-som">
          {compleet && grade
            ? `${kg(gewicht)} per exoot · ${eur(perExoot)} bij ${eur(grade.pricePerKg ?? 0)}/kg (kwaliteit) · ${eur(perExoot / n)} per werkstuk`
            : 'Vul kwaliteit, maten en lengte in om het gewicht en de prijs te zien.'}
        </div>
        {bestaand && (
          <Alert color="grape" p="xs" title="Deze exoot bestaat al">
            <Text size="xs">
              {bestaand.code}{bestaand.klant ? ` voor ${bestaand.klant.naam}` : ''}{bestaand.artikel ? `, gemaakt voor ${bestaand.artikel.naam}` : ''}.
              Gebruik je die, dan staan de stukken in de voorraad op één regel en gelden zijn leveranciersprijzen.
            </Text>
            <Button size="xs" mt={6} color="grape" variant="light" onClick={() => gebruikBestaand(bestaand)}>Bestaande gebruiken</Button>
          </Alert>
        )}
        <Text size="xs" c="dimmed">Voor het artikel {artikel.naam}. Leveranciers en hun prijzen koppel je daarna in de voorraad (filter Exoot → Alleen exoten) of bij de leverancier onder Prijzen.</Text>
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onSluit}>Annuleren</Button>
          <Button size="xs" color="grape" variant={bestaand ? 'default' : 'filled'} loading={maak.isPending} onClick={() => maak.mutate()}>{bestaand ? 'Toch nieuw aanmaken' : 'Aanmaken en gebruiken'}</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
