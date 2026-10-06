import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { waaromNietPrijsaanvraag, prijslijstVoorRegel, type BestelRegel, type Prijsaanvraag, type VergelijkData } from '@stockmanager/shared'
import { prijsaanvragenApi } from '../../../api/bestellingen'
import { relatiesApi } from '../../../api/relaties'
import { ApiFout } from '../../../api/client'
import { meldFout } from '../../../utils/fout-melding-toon'
import { eis } from '../../../utils/fout-melding'
import { aantalTekst } from './bestel-tekst'

/**
 * Een prijsaanvraag voor de gekozen regels (2026-10-06). Voorgesteld worden de
 * leveranciers die al een prijs hebben voor een van de regels; elke andere
 * leverancier kun je erbij zetten.
 */
export function PrijsaanvraagVenster({ regels, data, onGemaakt, onSluit }: {
  regels: BestelRegel[]; data: VergelijkData | undefined; onGemaakt: (a: Prijsaanvraag) => void; onSluit: () => void
}) {
  const qc = useQueryClient()
  const { data: relRes } = useQuery({ queryKey: ['relaties'], queryFn: relatiesApi.list })
  const leveranciers = (relRes?.data ?? relatiesApi.listSync())
    .filter((r) => r.actief !== false && (r.type === 'leverancier' || r.type === 'beide'))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  const metPrijs = new Set(
    data ? regels.flatMap((r) => [...prijslijstVoorRegel(data.prijzen, r, data.gelijk[r.id] ?? []).keys()]) : [],
  )
  const [gekozen, setGekozen] = useState<Set<string>>(metPrijs)
  const [notitie, setNotitie] = useState('')

  const maak = useMutation({
    mutationFn: () => {
      eis(waaromNietPrijsaanvraag(regels, [...gekozen]))
      return prijsaanvragenApi.create({ regelIds: regels.map((r) => r.id), leverancierIds: [...gekozen], notitie: notitie.trim() || null })
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['prijsaanvragen'] })
      qc.invalidateQueries({ queryKey: ['bestel-regels'] })
      notifications.show({ color: 'green', message: `${a.id} aangemaakt — verstuur hem nu per leverancier` })
      onGemaakt(a)
    },
    onError: (e) => meldFout({
      actie: 'Prijsaanvraag maken',
      fout: e,
      gevolg: e instanceof ApiFout && e.code === 'TIMEOUT'
        ? 'Onbekend of de aanvraag is aangemaakt. Kijk bij Prijsaanvragen voor je het opnieuw doet.'
        : 'Er is geen prijsaanvraag gemaakt en er is niets verstuurd.',
    }),
  })

  const wissel = (id: string) => setGekozen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <Modal opened onClose={onSluit} title={`Prijsaanvraag — ${regels.length} regel${regels.length === 1 ? '' : 's'}`} size="md">
      <Stack gap="xs">
        <div className="bs-venster-lijst">
          {regels.map((r) => (
            <div key={r.id}><b>{r.materiaal}</b> · {aantalTekst(r)}{r.projectNaam ? ` · ${r.projectNaam}` : ''}</div>
          ))}
        </div>
        <Text size="xs" fw={500}>Aan welke leveranciers?</Text>
        <div className="bs-venster-lijst">
          {leveranciers.length === 0 && <Text size="xs" c="dimmed">Er zijn nog geen relaties van type leverancier.</Text>}
          {leveranciers.map((l) => (
            <Checkbox
              key={l.id} size="xs" checked={gekozen.has(l.id)} onChange={() => wissel(l.id)}
              label={<>{l.naam}{metPrijs.has(l.id) && <span className="bs-zacht"> · heeft een prijs</span>}{!l.email && !l.contacten.some((c) => c.email) && <span className="bs-waarschuw"> · geen e-mailadres</span>}</>}
            />
          ))}
        </div>
        <Textarea size="xs" label="Opmerking op de aanvraag" autosize minRows={1} value={notitie} onChange={(e) => setNotitie(e.currentTarget.value)} />
        <Text size="xs" c="dimmed">Daarna verstuur je hem per leverancier: elke leverancier krijgt een eigen mail met een pdf zonder prijzen.</Text>
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onSluit}>Annuleren</Button>
          <Button size="xs" loading={maak.isPending} onClick={() => maak.mutate()}>Aanvraag maken</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
