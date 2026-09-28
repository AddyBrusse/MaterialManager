import { useState, type ReactNode } from 'react'
import { waaromNietVersturenOB, type Project } from '@stockmanager/shared'
import { useUserStore } from '../../../../../stores/user'
import { meldFout } from '../../../../../utils/fout-melding-toon'
import { Weigering } from '../../../../../utils/fout-melding'
import { toonPdfInVenster } from '../../../../../services/document-venster'
import { downloadEml, mailtoZonderBijlage } from '../../../../../services/eml'
import { BevestigModal } from '../../components/BevestigModal'
import { obBestandsnaam, obMail, obPdf } from '../../lib/ob-document'

/**
 * Openen, downloaden en klaarzetten van de opdrachtbevestiging.
 *
 * Versturen gaat via Outlook: de app maakt een `.eml` met de pdf erin, jij
 * drukt in Outlook op Verzenden. De app kan dat niet zien — daarom vraagt hij
 * daarna "Heb je hem verstuurd?", en legt pas bij Ja de verzending vast.
 */
export function useObDocument(p: Project, onVerstuurd: (naar: string | null) => void) {
  const gebruiker = useUserStore(s => s.user)
  const [klaar, setKlaar] = useState<{ naar: string | null; mailto: string } | null>(null)
  const obId = p.opdrachtbevestiging?.id ?? ''

  const openen = () => {
    try {
      const gelukt = toonPdfInVenster(obPdf(p), {
        titel: `Opdrachtbevestiging ${obId} — ${p.naam}`,
        bestandsnaam: obBestandsnaam(p),
      })
      if (!gelukt) {
        meldFout({
          actie: `Opdrachtbevestiging ${obId} openen`,
          fout: new Error('De browser hield het venster tegen (pop-upblokkering).'),
          gevolg: 'Er is niets geopend. Sta pop-ups toe voor deze app, of gebruik de knop Pdf om hem te downloaden.',
        })
      }
    } catch (fout) {
      meldFout({ actie: `Opdrachtbevestiging ${obId} openen`, fout, gevolg: 'Er is niets geopend en niets gewijzigd.' })
    }
  }

  const downloaden = () => {
    try {
      obPdf(p).save(obBestandsnaam(p))
    } catch (fout) {
      meldFout({ actie: `Opdrachtbevestiging ${obId} downloaden`, fout, gevolg: 'Er is niets gedownload en niets gewijzigd.' })
    }
  }

  const klaarzetten = () => {
    const actie = `Opdrachtbevestiging ${obId} versturen`
    const reden = waaromNietVersturenOB(p)
    if (reden) {
      meldFout({ actie, fout: new Weigering(reden), gevolg: 'Er is geen mail klaargezet en niets vastgelegd.' })
      return
    }
    try {
      const mail = obMail(p, gebruiker)
      downloadEml(mail, `Opdrachtbevestiging-${obId}.eml`)
      const tekst = 'Bijgaand onze opdrachtbevestiging. (Voeg de pdf toe als bijlage.)'
      setKlaar({ naar: mail.naar, mailto: mailtoZonderBijlage(mail.naar, mail.onderwerp, tekst) })
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
        onVerstuurd(klaar.naar)
        setKlaar(null)
      }}
    >
      <p>
        De mail staat in je downloads als <strong>Opdrachtbevestiging-{obId}.eml</strong>. Open hem:
        Outlook toont hem als nieuwe mail{klaar.naar ? <> aan <strong>{klaar.naar}</strong></> : ''}, met de
        pdf erin. Druk daar op Verzenden.
      </p>
      {!klaar.naar && (
        <p>Er is geen e-mailadres bekend bij deze klant; vul het in Outlook zelf in.</p>
      )}
      <p>Pas als je hier op <strong>Ja, verstuurd</strong> drukt, komt hij in het logboek.</p>
      <p style={{ fontSize: 11 }}>
        Opent het bestand niet als nieuwe mail? <a href={klaar.mailto}>Open een lege mail</a> en voeg
        de pdf (knop Pdf) zelf toe.
      </p>
    </BevestigModal>
  )

  return { openen, downloaden, klaarzetten, dialoog }
}
