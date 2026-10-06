import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { waaromNietBestelRegelWijzigen, kgVanRegel, type BestelRegel, type BestelRegelInvoer } from '@stockmanager/shared'
import { bestelRegelsApi } from '../../../api/bestellingen'
import { gradesApi } from '../../../api/grades'
import { profilesApi } from '../../../api/profiles'
import { ApiFout } from '../../../api/client'
import { meldFout } from '../../../utils/fout-melding-toon'
import { eis } from '../../../utils/fout-melding'
import { kg as kgTekst } from './bestel-tekst'

type Vooraf = Partial<Pick<BestelRegelInvoer, 'gradeId' | 'profileId' | 'dimensions' | 'lengteMm' | 'stuks' | 'bron' | 'rawMaterialId'>>

/**
 * Een bestelregel met de hand toevoegen, of maat en aantal wijzigen zolang hij
 * nog niet is aangevraagd (2026-10-06). Bestellen gaat in stuks × lengte: een
 * hele staaf, of een op maat gezaagd stuk.
 */
export function BestelRegelVenster({ bestaand, vooraf, onSluit }: { bestaand?: BestelRegel; vooraf?: Vooraf; onSluit: () => void }) {
  const qc = useQueryClient()
  const { data: gr } = useQuery({ queryKey: ['grades'], queryFn: gradesApi.list })
  const { data: pr } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const grades = gr?.data ?? []
  const profiles = pr?.data ?? []

  const [gradeId, setGradeId] = useState<string | null>(bestaand?.gradeId ?? vooraf?.gradeId ?? null)
  const [profileId, setProfileId] = useState<string | null>(bestaand?.profileId ?? vooraf?.profileId ?? null)
  const [dims, setDims] = useState<Record<string, number | string>>(bestaand?.dimensions ?? vooraf?.dimensions ?? {})
  const [lengte, setLengte] = useState<number | string>(bestaand?.lengteMm ?? vooraf?.lengteMm ?? '')
  const [stuks, setStuks] = useState<number | string>(bestaand?.stuks ?? vooraf?.stuks ?? 1)
  const [notitie, setNotitie] = useState(bestaand?.notitie ?? '')

  const profiel = profiles.find((p) => p.id === profileId)
  const grade = grades.find((g) => g.id === gradeId)
  const maten = Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, Number(v) || 0]))
  const compleet = !!profiel && profiel.dimensionSchema.every((d) => maten[d.key] > 0) && Number(lengte) > 0 && Number(stuks) >= 1
  const gewicht = compleet && grade
    ? kgVanRegel({ dimensions: maten, lengteMm: Number(lengte), stuks: Math.floor(Number(stuks)), volumeFormula: profiel!.volumeFormula, densityKgM3: Number(grade.densityKgM3) })
    : 0

  const opslaan = useMutation({
    mutationFn: async () => {
      if (bestaand) {
        const maatOfAantal = Number(lengte) !== bestaand.lengteMm || Number(stuks) !== bestaand.stuks
        if (maatOfAantal) eis(waaromNietBestelRegelWijzigen(bestaand))
        return bestelRegelsApi.update(bestaand.id, { lengteMm: Number(lengte), stuks: Math.floor(Number(stuks)), notitie: notitie.trim() || null })
      }
      eis(!gradeId ? 'Kies een kwaliteit.' : null)
      eis(!profiel ? 'Kies een vorm.' : null)
      eis(!compleet ? 'Vul alle maten, de lengte en het aantal stuks in.' : null)
      return bestelRegelsApi.create({
        bron: vooraf?.bron ?? 'handmatig', gradeId: gradeId!, profileId: profileId!, dimensions: maten,
        lengteMm: Number(lengte), stuks: Math.floor(Number(stuks)), notitie: notitie.trim() || null,
        rawMaterialId: vooraf?.rawMaterialId ?? null,
      })
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['bestel-regels'] })
      notifications.show({ color: 'green', message: `${r.materiaal} ${bestaand ? 'bijgewerkt' : 'op de bestellijst gezet'}` })
      onSluit()
    },
    onError: (e) => meldFout({
      actie: bestaand ? 'Bestelregel wijzigen' : 'Op de bestellijst zetten',
      fout: e,
      gevolg: e instanceof ApiFout && e.code === 'TIMEOUT'
        ? 'Onbekend of het is opgeslagen: de server antwoordde niet op tijd. Kijk in de lijst voor je het opnieuw doet.'
        : 'Er is niets opgeslagen; wat je invulde staat nog in het venster.',
    }),
  })

  return (
    <Modal opened onClose={onSluit} title={bestaand ? `Wijzigen — ${bestaand.materiaal}` : 'Materiaal op de bestellijst'} size="md">
      <Stack gap="xs">
        {!bestaand && (
          <>
            <SimpleGrid cols={2} spacing="xs">
              <Select size="xs" label="Kwaliteit" searchable data={grades.map((g) => ({ value: g.id, label: g.name }))} value={gradeId} onChange={setGradeId} />
              <Select size="xs" label="Vorm" allowDeselect={false} data={profiles.map((p) => ({ value: p.id, label: p.name }))} value={profileId} onChange={(v) => { setProfileId(v); setDims({}) }} />
            </SimpleGrid>
            <SimpleGrid cols={3} spacing="xs">
              {profiel?.dimensionSchema.map((d) => (
                <NumberInput key={d.key} size="xs" label={`${d.label} (${d.unit || 'mm'})`} min={0} decimalSeparator="," value={dims[d.key] ?? ''} onChange={(v) => setDims((o) => ({ ...o, [d.key]: v }))} />
              ))}
            </SimpleGrid>
          </>
        )}
        <SimpleGrid cols={2} spacing="xs">
          <NumberInput size="xs" label="Lengte per stuk (mm)" min={0} decimalSeparator="," thousandSeparator="." value={lengte} onChange={setLengte} data-autofocus />
          <NumberInput size="xs" label="Stuks" min={1} allowDecimal={false} value={stuks} onChange={setStuks} />
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          {gewicht > 0 ? `${kgTekst(gewicht)} in totaal. ` : ''}Een hele staaf of een op maat gezaagd stuk: de leverancier ziet de lengte op de aanvraag.
        </Text>
        <Textarea size="xs" label="Notitie" autosize minRows={1} value={notitie} onChange={(e) => setNotitie(e.currentTarget.value)} />
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onSluit}>Annuleren</Button>
          <Button size="xs" loading={opslaan.isPending} onClick={() => opslaan.mutate()}>{bestaand ? 'Opslaan' : 'Op de bestellijst'}</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
