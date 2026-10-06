import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { waaromNietInkoopVersturen, waaromNietInkoopIntrekken, waaromNietInkoopWijzigen, type Inkooporder } from '@stockmanager/shared'
import { inkoopordersApi, INKOOP_SLEUTELS } from '../../../api/inkooporders'
import { useUserStore } from '../../../stores/user'
import { downloadEml, mailtoZonderBijlage } from '../../../services/eml'
import { meldFout } from '../../../utils/fout-melding-toon'
import { Weigering, eis } from '../../../utils/fout-melding'
import { inkooporderBestandsnaam, inkooporderMail } from '../lib/inkooporder-document'

/**
 * Wat je met een inkooporder doet (2026-10-06, deel 3b): versturen via een
 * `.eml` en "Ja, verstuurd", intrekken met een reden, en zolang hij concept is
 * een regel eraf halen of hem verwijderen.
 */
export function useInkoopActies() {
  const qc = useQueryClient()
  const gebruiker = useUserStore((s) => s.user)
  const [klaar, setKlaar] = useState<{ o: Inkooporder; bestand: string; mailto: string } | null>(null)
  const [intrek, setIntrek] = useState<Inkooporder | null>(null)
  const [reden, setReden] = useState('')
  const ververs = () => { for (const k of INKOOP_SLEUTELS) qc.invalidateQueries({ queryKey: [k] }) }

  const verzonden = useMutation({
    mutationFn: (o: Inkooporder) => inkoopordersApi.verzonden(o.id),
    onSuccess: (o) => { ververs(); notifications.show({ color: 'green', message: `${o.id} staat als verstuurd; de regels zijn besteld` }) },
    onError: (e, o) => meldFout({ actie: `${o.id} als verstuurd vastleggen`, fout: e, gevolg: 'De mail is wel klaargezet, maar de order staat nog als concept. Druk opnieuw op Versturen en daarna op "Ja, verstuurd".' }),
  })
  const trekIn = useMutation({
    mutationFn: ({ o, reden }: { o: Inkooporder; reden: string }) => { eis(waaromNietInkoopIntrekken(o)); eis(reden.trim().length < 3 ? 'Vul een reden in (minstens 3 tekens).' : null); return inkoopordersApi.trekIn(o.id, reden.trim()) },
    onSuccess: (o) => { ververs(); setIntrek(null); setReden(''); notifications.show({ color: 'green', message: `${o.id} is ingetrokken; de regels staan weer klaar om te bestellen` }) },
    onError: (e, { o }) => meldFout({ actie: `${o.id} intrekken`, fout: e, gevolg: 'De inkooporder is niet veranderd.' }),
  })
  const verwijder = useMutation({
    mutationFn: (o: Inkooporder) => { eis(waaromNietInkoopWijzigen(o)); return inkoopordersApi.verwijder(o.id) },
    onSuccess: ververs,
    onError: (e, o) => meldFout({ actie: `${o.id} verwijderen`, fout: e, gevolg: 'Het concept staat er nog.' }),
  })
  const regelEraf = useMutation({
    mutationFn: ({ o, regelId }: { o: Inkooporder; regelId: string }) => { eis(waaromNietInkoopWijzigen(o)); return inkoopordersApi.regelEraf(o.id, regelId) },
    onSuccess: ververs,
    onError: (e, { o }) => meldFout({ actie: `Regel van ${o.id} halen`, fout: e, gevolg: 'De regel staat er nog op.' }),
  })

  const versturen = (o: Inkooporder) => {
    const actie = `${o.id} versturen aan ${o.leverancierNaam}`
    const nee = waaromNietInkoopVersturen(o)
    if (nee) { meldFout({ actie, fout: new Weigering(nee), gevolg: 'Er is geen mail klaargezet en niets vastgelegd.' }); return }
    try {
      const mail = inkooporderMail(o, gebruiker)
      const bestand = inkooporderBestandsnaam(o).replace(/\.pdf$/, '.eml')
      downloadEml(mail, bestand)
      setKlaar({ o, bestand, mailto: mailtoZonderBijlage(mail.naar, mail.onderwerp, 'Bijgaand onze inkooporder. (Voeg de pdf toe als bijlage.)') })
    } catch (fout) {
      meldFout({ actie, fout, gevolg: 'Er is geen mail klaargezet en niets vastgelegd.' })
    }
  }

  const dialoog: ReactNode = (
    <>
      {klaar && (
        <Modal opened onClose={() => setKlaar(null)} title="Heb je hem verstuurd?" size="md">
          <Stack gap="xs">
            <Text size="sm">De mail staat in je downloads als <strong>{klaar.bestand}</strong>. Open hem: Outlook toont hem als nieuwe mail aan <strong>{klaar.o.email}</strong>, met de pdf erin. Druk daar op Verzenden.</Text>
            <Text size="sm">Bij <strong>Ja, verstuurd</strong> ligt {klaar.o.id} vast en gaan de regels naar "Besteld". Daarna verander je er niets meer aan: intrekken en een nieuwe maken.</Text>
            <Text size="xs" c="dimmed">Opent het bestand niet als nieuwe mail? <a href={klaar.mailto}>Open een lege mail</a> en voeg de pdf (knop Pdf) zelf toe.</Text>
            <Group justify="flex-end" gap="xs">
              <Button size="xs" variant="default" onClick={() => setKlaar(null)}>Nog niet</Button>
              <Button size="xs" onClick={() => { verzonden.mutate(klaar.o); setKlaar(null) }}>Ja, verstuurd</Button>
            </Group>
          </Stack>
        </Modal>
      )}
      {intrek && (
        <Modal opened onClose={() => setIntrek(null)} title={`${intrek.id} intrekken`} size="md">
          <Stack gap="xs">
            <Text size="sm">De order blijft staan als <b>vervallen</b>, met deze reden. De regels gaan terug naar de bestellijst met hun gekozen leverancier; daar maak je een nieuwe inkooporder. Laat de leverancier zelf weten dat deze order vervalt.</Text>
            <Textarea size="xs" label="Reden" autosize minRows={2} value={reden} onChange={(e) => setReden(e.currentTarget.value)} data-autofocus placeholder="bijv. klant heeft de maat aangepast" />
            <Group justify="flex-end" gap="xs">
              <Button size="xs" variant="default" onClick={() => setIntrek(null)}>Annuleren</Button>
              <Button size="xs" color="red" loading={trekIn.isPending} onClick={() => trekIn.mutate({ o: intrek, reden })}>Intrekken</Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </>
  )

  return {
    versturen,
    intrekken: (o: Inkooporder) => {
      const nee = waaromNietInkoopIntrekken(o)
      if (nee) { meldFout({ actie: `${o.id} intrekken`, fout: new Weigering(nee), gevolg: 'Er is niets veranderd.' }); return }
      setReden(''); setIntrek(o)
    },
    verwijder: (o: Inkooporder) => { if (window.confirm(`Concept ${o.id} verwijderen? De regels gaan terug naar de bestellijst.`)) verwijder.mutate(o) },
    regelEraf: (o: Inkooporder, regelId: string) => regelEraf.mutate({ o, regelId }),
    dialoog,
  }
}
