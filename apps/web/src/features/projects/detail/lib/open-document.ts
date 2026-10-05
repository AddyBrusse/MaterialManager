import type { Project } from '@stockmanager/shared'
import type { DocVerwijzing } from '../tabs/DocumentenTab'
import { toonDocument } from './toon-document'
import { offerteBestandsnaam, offerteNummer, offertePdf } from './offerte-document'
import { obBestandsnaam, obPdf } from './ob-document'
import { pakbonBestandsnaam, pakbonPdf, picklistBestandsnaam, picklistPdf } from './pakbon-document'
import { factuurBestandsnaam, factuurPdf } from './factuur-document'
import { meldFout } from '../../../../utils/fout-melding-toon'

/**
 * Openen op de Documenten-tab (2026-10-05): dezelfde pdf als de knop op de
 * eigen tab, in hetzelfde documentvenster. Bestaat het document niet meer
 * (net verwijderd door iemand anders), dan zegt de melding dat.
 */
export function openDocument(p: Project, d: DocVerwijzing) {
  const weg = (wat: string) =>
    meldFout({
      actie: `${wat} openen`,
      fout: new Error(`${wat} staat niet (meer) op dit project.`),
      gevolg: 'Er is niets geopend. Ververs de pagina en probeer het opnieuw.',
    })

  if (d.soort === 'offerte') {
    const o = p.offertes.find((x) => x.id === d.id)
    if (!o) return weg(`Offerte ${d.id}`)
    return toonDocument(`Offerte ${offerteNummer(o)} openen`, () => offertePdf(p, o), {
      titel: `Offerte ${offerteNummer(o)} — ${p.naam}`,
      bestandsnaam: offerteBestandsnaam(o),
    })
  }
  if (d.soort === 'opdracht') {
    const ob = p.opdrachtbevestiging
    if (!ob) return weg('De opdrachtbevestiging')
    return toonDocument(`Opdrachtbevestiging ${ob.id} openen`, () => obPdf(p), {
      titel: `Opdrachtbevestiging ${ob.id} — ${p.naam}`,
      bestandsnaam: obBestandsnaam(p),
    })
  }
  if (d.soort === 'pakbon' || d.soort === 'picklist') {
    const pl = p.paklijsten.find((x) => x.id === d.id)
    if (!pl) return weg(`Pakbon ${d.id}`)
    const pick = d.soort === 'picklist'
    const naam = `${pick ? 'Picklist' : 'Pakbon'} ${pl.id}`
    return toonDocument(`${naam} openen`, () => (pick ? picklistPdf(p, pl) : pakbonPdf(p, pl)), {
      titel: `${naam} — ${p.naam}`,
      bestandsnaam: pick ? picklistBestandsnaam(pl) : pakbonBestandsnaam(pl),
    })
  }
  const f = p.facturen.find((x) => x.id === d.id)
  if (!f) return weg(`Factuur ${d.id}`)
  const naam = `${f.soort === 'credit' ? 'Creditfactuur' : 'Factuur'} ${f.id}`
  return toonDocument(`${naam} openen`, () => factuurPdf(p, f), {
    titel: `${naam} — ${p.naam}`,
    bestandsnaam: factuurBestandsnaam(f),
  })
}
