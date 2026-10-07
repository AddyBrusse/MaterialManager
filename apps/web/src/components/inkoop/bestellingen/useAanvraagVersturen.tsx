import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { waaromNietAanvraagVersturen, type BestelRegel, type Prijsaanvraag, type PrijsaanvraagLeverancier } from '@stockmanager/shared'
import { prijsaanvragenApi } from '../../../api/bestellingen'
import { useUserStore } from '../../../stores/user'
import { downloadEml, mailtoZonderBijlage } from '../../../services/eml'
import { meldFout } from '../../../utils/fout-melding-toon'
import { Weigering } from '../../../utils/fout-melding'
import { prijsaanvraagBestandsnaam, prijsaanvraagMail } from '../lib/prijsaanvraag-document'

/**
 * Een prijsaanvraag versturen aan één leverancier (2026-10-06), net als de
 * andere documenten: een `.eml` met de pdf erin; jij drukt in Outlook op
 * Verzenden, en pas bij "Ja, verstuurd" staat hij als verstuurd.
 */
export function useAanvraagVersturen(regels: BestelRegel[]) {
  const qc = useQueryClient()
  const gebruiker = useUserStore((s) => s.user)
  const [klaar, setKlaar] = useState<{ a: Prijsaanvraag; l: PrijsaanvraagLeverancier; bestand: string; mailto: string } | null>(null)

  const vastleggen = useMutation({
    mutationFn: (k: { a: Prijsaanvraag; l: PrijsaanvraagLeverancier }) => prijsaanvragenApi.verzonden(k.a.id, k.l.leverancierId),
    onSuccess: (_a, k) => {
      for (const key of ['prijsaanvragen', 'bestel-regels', 'vergelijk', 'inkoop', 'bestel-geschiedenis']) qc.invalidateQueries({ queryKey: [key] })
      notifications.show({ color: 'green', message: `${k.a.id} staat als verstuurd aan ${k.l.naam}` })
    },
    onError: (e, k) => meldFout({
      actie: `${k.a.id} als verstuurd vastleggen`,
      fout: e,
      gevolg: 'De mail is wel klaargezet, maar staat hier nog niet als verstuurd. Druk opnieuw op Versturen en daarna op "Ja, verstuurd".',
    }),
  })

  const klaarzetten = (a: Prijsaanvraag, l: PrijsaanvraagLeverancier) => {
    const actie = `${a.id} versturen aan ${l.naam}`
    const reden = waaromNietAanvraagVersturen(l)
    if (reden) {
      meldFout({ actie, fout: new Weigering(reden), gevolg: 'Er is geen mail klaargezet en niets vastgelegd.' })
      return
    }
    try {
      const mail = prijsaanvraagMail(a, l, regels, gebruiker)
      const bestand = prijsaanvraagBestandsnaam(a, l).replace(/\.pdf$/, '.eml')
      downloadEml(mail, bestand)
      setKlaar({ a, l, bestand, mailto: mailtoZonderBijlage(mail.naar, mail.onderwerp, 'Bijgaand onze prijsaanvraag. (Voeg de pdf toe als bijlage.)') })
    } catch (fout) {
      meldFout({ actie, fout, gevolg: 'Er is geen mail klaargezet en niets vastgelegd.' })
    }
  }

  const dialoog: ReactNode = klaar && (
    <Modal opened onClose={() => setKlaar(null)} title="Heb je hem verstuurd?" size="md">
      <Stack gap="xs">
        <Text size="sm">
          De mail staat in je downloads als <strong>{klaar.bestand}</strong>. Open hem: Outlook toont hem als nieuwe mail
          aan <strong>{klaar.l.email}</strong>, met de pdf erin. Druk daar op Verzenden.
        </Text>
        <Text size="sm">Pas bij <strong>Ja, verstuurd</strong> staat de aanvraag als verstuurd en gaan de regels naar "Aangevraagd".</Text>
        <Text size="xs" c="dimmed">
          Opent het bestand niet als nieuwe mail? <a href={klaar.mailto}>Open een lege mail</a> en voeg de pdf (knop Pdf) zelf toe.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={() => setKlaar(null)}>Nog niet</Button>
          <Button size="xs" onClick={() => { vastleggen.mutate({ a: klaar.a, l: klaar.l }); setKlaar(null) }}>Ja, verstuurd</Button>
        </Group>
      </Stack>
    </Modal>
  )

  return { klaarzetten, dialoog }
}
