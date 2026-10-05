import { useState, type ReactNode } from 'react'
import { waaromNietPakbonVersturen, type Paklijst, type Project } from '@stockmanager/shared'
import { useUserStore } from '../../../../../stores/user'
import { meldFout } from '../../../../../utils/fout-melding-toon'
import { Weigering } from '../../../../../utils/fout-melding'
import { downloadEml, mailtoZonderBijlage } from '../../../../../services/eml'
import { BevestigModal } from '../../components/BevestigModal'
import { pakbonBestandsnaam, pakbonMail, waaromGeenPakbonMail } from '../../lib/pakbon-document'

/**
 * Een pakbon versturen (2026-10-05), net als de factuur: de app maakt een
 * `.eml` met de pdf erin, aan de contactpersoon van de order; jij drukt in
 * Outlook op Verzenden, en pas bij "Ja, verstuurd" staat hij als verstuurd.
 * Tot dan zette Versturen alleen de status — het systeem zei "verstuurd"
 * terwijl er niets de deur uit was.
 */
export function usePakbonDocument(p: Project | undefined, onVerstuurd: (paklijstId: string) => void) {
  const gebruiker = useUserStore((s) => s.user)
  const [klaar, setKlaar] = useState<{ pl: Paklijst; naar: string | null; mailto: string } | null>(null)

  const klaarzetten = (paklijstId: string) => {
    if (!p) return
    const actie = `${paklijstId} versturen`
    const reden = waaromNietPakbonVersturen(p, paklijstId) ?? waaromGeenPakbonMail(p)
    if (reden) {
      meldFout({ actie, fout: new Weigering(reden), gevolg: 'Er is geen mail klaargezet en niets vastgelegd.' })
      return
    }
    const pl = p.paklijsten.find((x) => x.id === paklijstId)!
    try {
      const mail = pakbonMail(p, pl, gebruiker)
      downloadEml(mail, pakbonBestandsnaam(pl).replace(/\.pdf$/, '.eml'))
      setKlaar({ pl, naar: mail.naar, mailto: mailtoZonderBijlage(mail.naar, mail.onderwerp, 'Bijgaand de pakbon. (Voeg de pdf toe als bijlage.)') })
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
        onVerstuurd(klaar.pl.id)
        setKlaar(null)
      }}
    >
      <p>
        De mail staat in je downloads als <strong>{pakbonBestandsnaam(klaar.pl).replace(/\.pdf$/, '.eml')}</strong>.
        Open hem: Outlook toont hem als nieuwe mail aan <strong>{klaar.naar}</strong>, met de pdf erin. Druk daar op
        Verzenden.
      </p>
      <p>Pas als je hier op <strong>Ja, verstuurd</strong> drukt, staat de pakbon als verstuurd en gaat de projectstatus mee.</p>
      <p style={{ fontSize: 11 }}>
        Opent het bestand niet als nieuwe mail? <a href={klaar.mailto}>Open een lege mail</a> en voeg de pdf (knop
        Pdf) zelf toe.
      </p>
    </BevestigModal>
  )

  return { klaarzetten, dialoog }
}
