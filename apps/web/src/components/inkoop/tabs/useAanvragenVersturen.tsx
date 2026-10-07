import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { BestelRegel, Prijsaanvraag } from '@stockmanager/shared'
import { prijsaanvragenApi } from '../../../api/bestellingen'
import { INKOOP_SLEUTELS } from '../../../api/inkooporders'
import { useUserStore } from '../../../stores/user'
import { downloadEml } from '../../../services/eml'
import { meldFout } from '../../../utils/fout-melding-toon'
import { prijsaanvraagBestandsnaam, prijsaanvraagMail } from '../lib/prijsaanvraag-document'

const versie = (n: number) => (n === 1 ? 'verstuurd' : n === 2 ? 'allebei verstuurd' : 'allemaal verstuurd')

/**
 * Prijzen aanvragen (2026-10-07): per leverancier één aanvraag met één mail, en
 * één vraag "Heb je ze verstuurd?" voor allemaal. Pas bij "Ja" zijn de regels
 * aangevraagd. Bij "Nog niet" gaan de aanvragen weer weg: er is niets verstuurd.
 */
export function useAanvragenVersturen(regels: BestelRegel[]) {
  const qc = useQueryClient()
  const gebruiker = useUserStore((s) => s.user)
  const [klaar, setKlaar] = useState<Prijsaanvraag[] | null>(null)
  const ververs = () => { for (const k of INKOOP_SLEUTELS) qc.invalidateQueries({ queryKey: [k] }) }

  const maak = useMutation({
    mutationFn: ({ regelIds, extra }: { regelIds: string[]; extra?: string[] }) => prijsaanvragenApi.perLeverancier(regelIds, extra),
    onSuccess: (aanvragen) => {
      ververs()
      const gelukt: Prijsaanvraag[] = []
      for (const a of aanvragen) {
        const l = a.leveranciers[0]
        try {
          downloadEml(prijsaanvraagMail(a, l, regels, gebruiker), prijsaanvraagBestandsnaam(a, l).replace(/\.pdf$/, '.eml'))
          gelukt.push(a)
        } catch (fout) {
          meldFout({ actie: `Mail voor ${a.id} aan ${l.naam} klaarzetten`, fout, gevolg: `${a.id} is aangemaakt maar niet gemaild. Bij "Nog niet" gaat hij weer weg.` })
        }
      }
      setKlaar(aanvragen)
    },
    onError: (e) => meldFout({ actie: 'Prijzen aanvragen', fout: e, gevolg: 'Er is geen aanvraag gemaakt en niets gemaild.' }),
  })
  const verstuurd = useMutation({
    mutationFn: (ids: string[]) => prijsaanvragenApi.verzondenAlle(ids),
    onSuccess: (a) => { ververs(); setKlaar(null); notifications.show({ color: 'green', message: `${a.map((x) => x.id).join(', ')} staan als verstuurd; de regels staan bij Open prijsaanvragen` }) },
    onError: (e) => meldFout({ actie: 'Aanvragen als verstuurd vastleggen', fout: e, gevolg: 'Ze staan nog niet als verstuurd. Druk opnieuw op "Ja".' }),
  })
  const nogNiet = useMutation({
    mutationFn: async (ids: string[]) => { for (const id of ids) await prijsaanvragenApi.remove(id) },
    onSuccess: () => { ververs(); setKlaar(null) },
    onError: (e) => meldFout({ actie: 'Klaargezette aanvragen weghalen', fout: e, gevolg: 'Een deel van de aanvragen staat er misschien nog; ze zijn niet als verstuurd vastgelegd.' }),
  })

  const dialoog: ReactNode = klaar && (
    <Modal opened onClose={() => nogNiet.mutate(klaar.map((a) => a.id))} title="Heb je ze verstuurd?" size="md">
      <Stack gap="xs">
        <Text size="sm">
          {klaar.length === 1 ? 'De mail staat' : `${klaar.length} mails staan`} in je downloads
          ({klaar.map((a) => `${a.id} aan ${a.leveranciers[0]?.naam}`).join(', ')}), elk met de prijsaanvraag-pdf erin. Open ze en druk in Outlook op Verzenden.
        </Text>
        <Text size="sm">Bij <b>Ja, {versie(klaar.length)}</b> gaan de regels naar <b>Open prijsaanvragen</b>. Bij <b>Nog niet</b> wordt er niets vastgelegd en blijven ze hier staan.</Text>
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" loading={nogNiet.isPending} onClick={() => nogNiet.mutate(klaar.map((a) => a.id))}>Nog niet</Button>
          <Button size="xs" loading={verstuurd.isPending} onClick={() => verstuurd.mutate(klaar.map((a) => a.id))}>Ja, {versie(klaar.length)}</Button>
        </Group>
      </Stack>
    </Modal>
  )

  return {
    /** Zonder `extra`: de leveranciers op de regels. Met `extra`: die leveranciers erbij. */
    aanvragen: (regelIds: string[], extra?: string[]) => maak.mutate({ regelIds, extra }),
    bezig: maak.isPending,
    dialoog,
  }
}
