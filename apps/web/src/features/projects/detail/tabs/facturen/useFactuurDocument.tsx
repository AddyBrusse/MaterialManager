import { useState, type ReactNode } from 'react'
import { vervaldatumVanaf, waaromNietFactuurVersturen, type Factuur, type Project } from '@stockmanager/shared'
import { relatiesApi } from '../../../../../api/relaties'
import { useUserStore } from '../../../../../stores/user'
import { meldFout } from '../../../../../utils/fout-melding-toon'
import { Weigering } from '../../../../../utils/fout-melding'
import { toonPdfInVenster } from '../../../../../services/document-venster'
import { downloadEml, mailtoZonderBijlage } from '../../../../../services/eml'
import { BevestigModal } from '../../components/BevestigModal'
import { factuurBestandsnaam, factuurMail, factuurPdf } from '../../lib/factuur-document'

/**
 * Openen en versturen van een factuur of credit — zoals de opdrachtbevestiging:
 * de app maakt een `.eml` met de pdf erin, jij drukt in Outlook op Verzenden,
 * en pas bij "Ja, verstuurd" legt de app vast dat hij weg is (met het adres en
 * de vervaldatum). Staat op de pagina, zodat ook de footerknop hem gebruikt.
 */
export function useFactuurDocument(p: Project | undefined, onVerstuurd: (factuurId: string, naar: string | null) => void) {
  const gebruiker = useUserStore(s => s.user)
  const [klaar, setKlaar] = useState<{ f: Factuur; naar: string | null; mailto: string } | null>(null)

  /** Zoals hij de deur uit gaat: met de datum van vandaag en de vervaldatum die de server ook rekent. */
  const alsVerstuurd = (f: Factuur): Factuur => {
    if (f.verzondenOp || !p) return f
    const termijn = p.relatieId ? relatiesApi.listSync().find(r => r.id === p.relatieId)?.betalingstermijn : null
    const nu = new Date()
    return { ...f, verzondenOp: nu.toISOString(), vervaldatum: f.soort === 'factuur' ? vervaldatumVanaf(nu, termijn) : null }
  }

  const openen = (f: Factuur) => {
    if (!p) return
    try {
      const gelukt = toonPdfInVenster(factuurPdf(p, alsVerstuurd(f)), {
        titel: `${f.soort === 'credit' ? 'Creditfactuur' : 'Factuur'} ${f.id} — ${p.naam}`,
        bestandsnaam: factuurBestandsnaam(f),
      })
      if (!gelukt) {
        meldFout({
          actie: `${f.id} openen`,
          fout: new Error('De browser hield het venster tegen (pop-upblokkering).'),
          gevolg: 'Er is niets geopend. Sta pop-ups toe voor deze app.',
        })
      }
    } catch (fout) {
      meldFout({ actie: `${f.id} openen`, fout, gevolg: 'Er is niets geopend en niets gewijzigd.' })
    }
  }

  const klaarzetten = (f: Factuur) => {
    if (!p) return
    const actie = `${f.id} versturen`
    const reden = waaromNietFactuurVersturen(p, f.id, f.naarEmail)
    if (reden) {
      meldFout({ actie, fout: new Weigering(reden), gevolg: 'Er is geen mail klaargezet en niets vastgelegd.' })
      return
    }
    try {
      const mail = factuurMail(p, alsVerstuurd(f), f.naarEmail, gebruiker)
      downloadEml(mail, `${factuurBestandsnaam(f).replace(/\.pdf$/, '')}.eml`)
      setKlaar({ f, naar: mail.naar, mailto: mailtoZonderBijlage(mail.naar, mail.onderwerp, 'Bijgaand onze factuur. (Voeg de pdf toe als bijlage.)') })
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
        onVerstuurd(klaar.f.id, klaar.naar)
        setKlaar(null)
      }}
    >
      <p>
        De mail staat in je downloads als <strong>{factuurBestandsnaam(klaar.f).replace(/\.pdf$/, '.eml')}</strong>.
        Open hem: Outlook toont hem als nieuwe mail aan <strong>{klaar.naar}</strong>, met de pdf erin. Druk daar op
        Verzenden.
      </p>
      <p>Pas als je hier op <strong>Ja, verstuurd</strong> drukt, staat hij als verstuurd en loopt de betaaltermijn.</p>
      <p style={{ fontSize: 11 }}>
        Opent het bestand niet als nieuwe mail? <a href={klaar.mailto}>Open een lege mail</a> en voeg de pdf (knop
        Pdf) zelf toe.
      </p>
    </BevestigModal>
  )

  return { openen, klaarzetten, dialoog }
}
