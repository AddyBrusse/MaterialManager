import { useState, type ReactNode } from 'react'
import { waaromNietVersturen, type Offerte, type Project } from '@stockmanager/shared'
import { useUserStore } from '../../../../../stores/user'
import { meldFout } from '../../../../../utils/fout-melding-toon'
import { Weigering } from '../../../../../utils/fout-melding'
import { toonPdfInVenster } from '../../../../../services/document-venster'
import { downloadEml, mailtoZonderBijlage } from '../../../../../services/eml'
import { BevestigModal } from '../../components/BevestigModal'
import { offerteBestandsnaam, offerteMail, offerteNummer, offertePdf } from '../../lib/offerte-document'

/**
 * Openen en versturen van een offerteversie — zoals de opdrachtbevestiging:
 * de app maakt een `.eml` met de pdf erin, jij drukt in Outlook op Verzenden,
 * en pas bij "Ja, verstuurd" wordt hij verzonden (2026-10-05). Staat op de
 * pagina, zodat ook de footerknop hem gebruikt.
 */
export function useOfferteDocument(p: Project | undefined, onVerstuurd: (offerteId: string) => void) {
  const gebruiker = useUserStore((s) => s.user)
  const [klaar, setKlaar] = useState<{ o: Offerte; naar: string | null; mailto: string } | null>(null)

  /** Zoals hij de deur uit gaat: met de datum van vandaag op de pdf. */
  const alsVerstuurd = (o: Offerte): Offerte => (o.verzondenOp ? o : { ...o, verzondenOp: new Date().toISOString() })

  const openen = (o: Offerte) => {
    if (!p) return
    const actie = `Offerte ${offerteNummer(o)} openen`
    try {
      const gelukt = toonPdfInVenster(offertePdf(p, o), {
        titel: `Offerte ${offerteNummer(o)} — ${p.naam}`,
        bestandsnaam: offerteBestandsnaam(o),
      })
      if (!gelukt) {
        meldFout({
          actie,
          fout: new Error('De browser hield het venster tegen (pop-upblokkering).'),
          gevolg: 'Er is niets geopend. Sta pop-ups toe voor deze app.',
        })
      }
    } catch (fout) {
      meldFout({ actie, fout, gevolg: 'Er is niets geopend en niets gewijzigd.' })
    }
  }

  const klaarzetten = (o: Offerte) => {
    if (!p) return
    const actie = `Offerte ${offerteNummer(o)} versturen`
    const reden = waaromNietVersturen(o)
    if (reden) {
      meldFout({ actie, fout: new Weigering(reden), gevolg: 'Er is geen mail klaargezet en niets vastgelegd.' })
      return
    }
    try {
      const mail = offerteMail(p, alsVerstuurd(o), gebruiker)
      downloadEml(mail, offerteBestandsnaam(o).replace(/\.pdf$/, '.eml'))
      const tekst = 'Bijgaand onze offerte. (Voeg de pdf toe als bijlage.)'
      setKlaar({ o, naar: mail.naar, mailto: mailtoZonderBijlage(mail.naar, mail.onderwerp, tekst) })
    } catch (fout) {
      meldFout({ actie, fout, gevolg: 'Er is geen mail klaargezet en niets vastgelegd.' })
    }
  }

  const dialoog: ReactNode = klaar && (
    <BevestigModal
      titel="Heb je hem verstuurd?"
      knop="Ja, verstuurd"
      annuleer="Nog niet"
      onSluit={() => setKlaar(null)}
      onBevestig={() => {
        onVerstuurd(klaar.o.id)
        setKlaar(null)
      }}
    >
      <p>
        De mail staat in je downloads als <strong>{offerteBestandsnaam(klaar.o).replace(/\.pdf$/, '.eml')}</strong>.
        Open hem: Outlook toont hem als nieuwe mail{klaar.naar ? <> aan <strong>{klaar.naar}</strong></> : ''}, met
        de pdf erin. Druk daar op Verzenden.
      </p>
      {!klaar.naar && <p>Er is geen e-mailadres bekend bij deze klant; vul het in Outlook zelf in.</p>}
      <p>Pas als je hier op <strong>Ja, verstuurd</strong> drukt, staat de offerte als verzonden.</p>
      <p style={{ fontSize: 11 }}>
        Opent het bestand niet als nieuwe mail? <a href={klaar.mailto}>Open een lege mail</a> en voeg de pdf (knop
        Pdf) zelf toe.
      </p>
    </BevestigModal>
  )

  return { openen, klaarzetten, dialoog }
}
