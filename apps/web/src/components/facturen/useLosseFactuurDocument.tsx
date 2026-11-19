import { useState } from 'react'
import { notifications } from '@mantine/notifications'
import {
  factuurNaam, heeftFactuurnummer, vervaldatumVanaf, voorraadTekorten, voorraadWaarschuwing, waaromNietVersturenVan,
  type VerkoopFactuur,
} from '@stockmanager/shared'
import { facturenApi } from '../../api/facturen'
import { ApiFout } from '../../api/client'
import { relatiesApi } from '../../api/relaties'
import { useUserStore } from '../../stores/user'
import { meldFout } from '../../utils/fout-melding-toon'
import { Weigering } from '../../utils/fout-melding'
import { toonPdfInVenster } from '../../services/document-venster'
import { downloadEml, mailtoZonderBijlage } from '../../services/eml'
import { BevestigModal } from '../../features/projects/detail/components/BevestigModal'
import { factuurBestandsnaam } from '../../features/projects/detail/lib/factuur-document'
import { losseFactuurMail, losseFactuurPdf, lossePakbonPdf, pakbonBestandsnaam } from './losse-factuur-document'
import { VerstuurdVraag } from './VerstuurdVraag'

const hoofdletter = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const onbekend = (fout: unknown) => fout instanceof ApiFout && fout.code === 'TIMEOUT'

/**
 * Pdf, pakbon en versturen van een losse factuur of credit (2026-11-18), zoals
 * bij een projectfactuur: nummer halen, `.eml` met de pdf in Outlook, en pas
 * bij "Ja, verstuurd" vastleggen. Dan gaan de stuks van de vrije voorraad (een
 * credit met retour zet ze terug). Te weinig op voorraad is een waarschuwing,
 * geen weigering: de artikelvoorraad werd tot nu nergens bijgehouden.
 */
export function useLosseFactuurDocument(onVeranderd: () => void) {
  const gebruiker = useUserStore((s) => s.user)
  const [klaar, setKlaar] = useState<{ f: VerkoopFactuur; mailto: string } | null>(null)
  const [tekort, setTekort] = useState<{ f: VerkoopFactuur; tekst: string } | null>(null)
  const [bezig, setBezig] = useState(false)

  const alsVerstuurd = (f: VerkoopFactuur): VerkoopFactuur => {
    if (f.verzondenOp) return f
    const termijn = relatiesApi.listSync().find((r) => r.id === f.relatieId)?.betalingstermijn
    const nu = new Date()
    return { ...f, verzondenOp: nu.toISOString(), vervaldatum: f.soort === 'factuur' ? vervaldatumVanaf(nu, termijn) : null }
  }

  const toon = (wat: string, maak: () => ReturnType<typeof losseFactuurPdf>, bestandsnaam: string) => {
    try {
      if (!toonPdfInVenster(maak(), { titel: wat, bestandsnaam })) {
        meldFout({ actie: `${wat} openen`, fout: new Error('De browser hield het venster tegen (pop-upblokkering).'), gevolg: 'Er is niets geopend. Sta pop-ups toe voor deze app.' })
      }
    } catch (fout) {
      meldFout({ actie: `${wat} openen`, fout, gevolg: 'Er is niets geopend en niets gewijzigd.' })
    }
  }
  const openen = (f: VerkoopFactuur) => toon(hoofdletter(factuurNaam(f)), () => losseFactuurPdf(alsVerstuurd(f)), factuurBestandsnaam(f))
  const pakbon = (f: VerkoopFactuur) => toon(`Pakbon bij ${factuurNaam(f)}`, () => lossePakbonPdf(f), pakbonBestandsnaam(f))

  const klaarzetten = async (f: VerkoopFactuur, tekortGezien = false) => {
    if (bezig) return
    const actie = `${hoofdletter(factuurNaam(f))} versturen`
    const nee = waaromNietVersturenVan(f, f.naarEmail)
    if (nee) {
      meldFout({ actie, fout: new Weigering(nee), gevolg: 'Er is geen nummer gegeven, geen mail klaargezet en niets vastgelegd.' })
      return
    }
    setBezig(true)
    try {
      if (f.soort === 'factuur' && !tekortGezien && f.relatieId) {
        const info = await facturenApi.verkoopInfo(f.relatieId)
        const tekst = voorraadWaarschuwing(voorraadTekorten(f.regels, (id) => info.find((i) => i.artikelId === id)?.vrij ?? 0))
        if (tekst) {
          setTekort({ f, tekst })
          return
        }
      }
      const g = heeftFactuurnummer(f.id) ? f : await facturenApi.nummer(f.id, f.naarEmail)
      if (g.id !== f.id) onVeranderd()
      const mail = losseFactuurMail(alsVerstuurd(g), gebruiker)
      downloadEml(mail, factuurBestandsnaam(g).replace(/\.pdf$/, '.eml'))
      setKlaar({ f: g, mailto: mailtoZonderBijlage(mail.naar, mail.onderwerp, 'Bijgaand onze factuur. (Voeg de pdf toe als bijlage.)') })
    } catch (fout) {
      meldFout({
        actie, fout,
        gevolg: onbekend(fout)
          ? 'Onbekend of er een nummer is gegeven: de server antwoordde niet op tijd. Ververs de pagina voor je het opnieuw doet.'
          : 'Er is geen mail klaargezet en niets als verstuurd vastgelegd.',
      })
      onVeranderd()
    } finally {
      setBezig(false)
    }
  }

  const verstuurd = async (f: VerkoopFactuur) => {
    setKlaar(null)
    try {
      const g = await facturenApi.verzend(f.id, f.naarEmail)
      const stuks = g.regels.filter((r) => r.artikelId).reduce((s, r) => s + r.qty, 0)
      const voorraad = g.soort === 'factuur' ? `; ${stuks} stuks van de voorraad af` : g.retour ? `; ${stuks} stuks terug op voorraad` : ''
      notifications.show({ color: 'green', message: `${g.id} staat als verstuurd${voorraad}` })
    } catch (fout) {
      meldFout({
        actie: `${f.id} als verstuurd vastleggen`, fout,
        gevolg: onbekend(fout)
          ? 'Onbekend of hij als verstuurd staat: de server antwoordde niet op tijd. Kijk in de lijst voor je het opnieuw doet.'
          : `${f.id} staat nog niet als verstuurd en de voorraad is niet gewijzigd. Druk opnieuw op Versturen en daarna op Ja, verstuurd.`,
      })
    }
    onVeranderd()
  }

  const dialoog = tekort ? (
    <BevestigModal titel="Te weinig op voorraad" knop="Toch versturen" annuleer="Terug" onSluit={() => setTekort(null)}
      onBevestig={() => { const f = tekort.f; setTekort(null); void klaarzetten(f, true) }}>
      <p>{tekort.tekst}</p>
      <p>Ligt het er wel, dan klopt het getal niet: tel de voorraad op de artikelpagina (tab Prijs &amp; voorraad).</p>
    </BevestigModal>
  ) : klaar ? (
    <VerstuurdVraag id={klaar.f.id} bestand={factuurBestandsnaam(klaar.f).replace(/\.pdf$/, '.eml')} naar={klaar.f.naarEmail}
      mailto={klaar.mailto} onSluit={() => setKlaar(null)} onVerstuurd={() => void verstuurd(klaar.f)} />
  ) : null

  return { openen, pakbon, klaarzetten, dialoog, bezig }
}
