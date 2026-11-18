import { useState } from 'react'
import { factuurNaam, heeftFactuurnummer, vervaldatumVanaf, waaromNietFactuurVersturen, type Factuur, type Project } from '@stockmanager/shared'
import { projectsApi } from '../../../../../api/projects'
import { ApiFout } from '../../../../../api/client'
import { relatiesApi } from '../../../../../api/relaties'
import { useUserStore } from '../../../../../stores/user'
import { meldFout } from '../../../../../utils/fout-melding-toon'
import { Weigering } from '../../../../../utils/fout-melding'
import { toonPdfInVenster } from '../../../../../services/document-venster'
import { downloadEml, mailtoZonderBijlage } from '../../../../../services/eml'
import { VerstuurdVraag } from '../../../../../components/facturen/VerstuurdVraag'
import { factuurBestandsnaam, factuurMail, factuurPdf } from '../../lib/factuur-document'

const hoofdletter = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/**
 * Openen en versturen van een factuur of credit — zoals de opdrachtbevestiging:
 * de app maakt een `.eml` met de pdf erin, jij drukt in Outlook op Verzenden,
 * en pas bij "Ja, verstuurd" legt de app vast dat hij weg is (met het adres en
 * de vervaldatum). Staat op de pagina, zodat ook de footerknop hem gebruikt.
 *
 * Sinds 2026-11-18 haalt Versturen eerst het factuurnummer bij de server: een
 * concept heeft er nog geen, en de pdf in de mail moet het dragen.
 */
export function useFactuurDocument(
  p: Project | undefined,
  onVerstuurd: (factuurId: string, naar: string | null) => void,
  onGenummerd: () => void,
) {
  const gebruiker = useUserStore(s => s.user)
  const [klaar, setKlaar] = useState<{ f: Factuur; naar: string | null; mailto: string } | null>(null)
  const [bezig, setBezig] = useState(false)

  /** Zoals hij de deur uit gaat: met de datum van vandaag en de vervaldatum die de server ook rekent. */
  const alsVerstuurd = (proj: Project, f: Factuur): Factuur => {
    if (f.verzondenOp) return f
    const termijn = proj.relatieId ? relatiesApi.listSync().find(r => r.id === proj.relatieId)?.betalingstermijn : null
    const nu = new Date()
    return { ...f, verzondenOp: nu.toISOString(), vervaldatum: f.soort === 'factuur' ? vervaldatumVanaf(nu, termijn) : null }
  }

  const openen = (f: Factuur) => {
    if (!p) return
    const naam = hoofdletter(factuurNaam(f))
    try {
      const gelukt = toonPdfInVenster(factuurPdf(p, alsVerstuurd(p, f)), {
        titel: `${naam} — ${p.naam}`,
        bestandsnaam: factuurBestandsnaam(f),
      })
      if (!gelukt) {
        meldFout({
          actie: `${naam} openen`,
          fout: new Error('De browser hield het venster tegen (pop-upblokkering).'),
          gevolg: 'Er is niets geopend. Sta pop-ups toe voor deze app.',
        })
      }
    } catch (fout) {
      meldFout({ actie: `${naam} openen`, fout, gevolg: 'Er is niets geopend en niets gewijzigd.' })
    }
  }

  const klaarzetten = async (f: Factuur) => {
    if (!p || bezig) return
    const actie = `${hoofdletter(factuurNaam(f))} versturen`
    const reden = waaromNietFactuurVersturen(p, f.id, f.naarEmail)
    if (reden) {
      meldFout({ actie, fout: new Weigering(reden), gevolg: 'Er is geen nummer gegeven, geen mail klaargezet en niets vastgelegd.' })
      return
    }
    let g = f
    if (!heeftFactuurnummer(f.id)) {
      setBezig(true)
      try {
        g = await projectsApi.nummerFactuur(p.id, f.id, f.naarEmail)
      } catch (fout) {
        meldFout({
          actie, fout,
          gevolg: fout instanceof ApiFout && fout.code === 'TIMEOUT'
            ? 'Onbekend of er een nummer is gegeven: de server antwoordde niet op tijd. Ververs de pagina voor je het opnieuw doet.'
            : 'Er is geen nummer gegeven en geen mail klaargezet.',
        })
        return
      } finally {
        setBezig(false)
        onGenummerd()
      }
    }
    try {
      const proj = projectsApi.get(p.id)
      const mail = factuurMail(proj, alsVerstuurd(proj, g), g.naarEmail, gebruiker)
      downloadEml(mail, `${factuurBestandsnaam(g).replace(/\.pdf$/, '')}.eml`)
      setKlaar({ f: g, naar: mail.naar, mailto: mailtoZonderBijlage(mail.naar, mail.onderwerp, 'Bijgaand onze factuur. (Voeg de pdf toe als bijlage.)') })
    } catch (fout) {
      meldFout({
        actie: `${g.id} versturen`, fout,
        gevolg: `${g.id} heeft zijn nummer, maar er is geen mail klaargezet en niets als verstuurd vastgelegd. Probeer Versturen opnieuw.`,
      })
    }
  }

  const dialoog = klaar && (
    <VerstuurdVraag
      id={klaar.f.id}
      bestand={factuurBestandsnaam(klaar.f).replace(/\.pdf$/, '.eml')}
      naar={klaar.naar}
      mailto={klaar.mailto}
      onSluit={() => setKlaar(null)}
      onVerstuurd={() => {
        onVerstuurd(klaar.f.id, klaar.naar)
        setKlaar(null)
      }}
    />
  )

  return { openen, klaarzetten, dialoog, bezig }
}
