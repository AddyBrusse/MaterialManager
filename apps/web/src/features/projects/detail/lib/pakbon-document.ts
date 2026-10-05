import type jsPDF from 'jspdf'
import { basisRegels, type Paklijst, type Project } from '@stockmanager/shared'
import { companyApi } from '../../../../api/company'
import { documentAssets } from '../../../../services/document/assets'
import { pakbonDocument, picklistDocument, type PakbonDoc } from '../../../../services/document/documenten'
import { afleverAdres, artikelVanRegel, klantVan, materiaalVan, notitieVan } from './document-gegevens'

/**
 * De pakbon als document (2026-10-05), en dezelfde pakbon als picklist om mee
 * te pakken. Beide uit dezelfde gegevens, zodat de lijst in de hal precies is
 * wat er op de pakbon naar de klant gaat.
 */

/** Waar een pakbonregel bij hoort: het vastgelegde veld, anders via de productieorder. */
function regelIdVan(p: Project, r: Paklijst['regels'][number]): string | null {
  return r.offerteRegelId ?? p.productieOrders.find((o) => o.id === r.productieOrderId)?.offerteRegelId ?? null
}

function gegevens(p: Project, pl: Paklijst): PakbonDoc {
  const { relatie, contact } = klantVan(p)
  const besteld = new Map(basisRegels(p).map((r) => [r.id, r.qty]))
  // Wat er tot en met déze pakbon geleverd is: de pakbonnen ervóór plus deze.
  // Latere pakbonnen tellen niet mee — dit document zegt wat er op dit moment nog kwam.
  const tot = p.paklijsten.slice(0, p.paklijsten.findIndex((x) => x.id === pl.id) + 1)
  const geleverd = new Map<string, number>()
  for (const x of tot) {
    for (const r of x.regels) {
      const id = regelIdVan(p, r)
      if (id) geleverd.set(id, (geleverd.get(id) ?? 0) + r.qty)
    }
  }

  return {
    nummer: pl.id,
    datum: pl.verzondenOp ?? pl.createdAt,
    klantNaam: relatie?.naam ?? p.naam,
    aflever: {
      naam: relatie?.naam ?? p.naam,
      regels: [...(contact?.naam ? [`t.a.v. ${contact.naam}`] : []), ...afleverAdres(relatie)],
    },
    referentie: p.opdrachtbevestiging?.opdrachtRef || p.klantRef || null,
    order: p.opdrachtbevestiging?.id ?? null,
    project: p.naam,
    regels: pl.regels.map((r) => {
      const id = regelIdVan(p, r)
      const artikel = artikelVanRegel(p, id)
      const b = id ? besteld.get(id) ?? r.qty : r.qty
      return {
        naam: r.artikelNaam,
        notitie: notitieVan(null, artikel),
        materiaal: materiaalVan(artikel),
        locatie: artikel?.locatie ?? null,
        besteld: b,
        qty: r.qty,
        restant: Math.max(0, b - (id ? geleverd.get(id) ?? r.qty : r.qty)),
        eenheid: r.eenheid,
      }
    }),
    notities: pl.notities,
  }
}

export function pakbonPdf(p: Project, pl: Paklijst): jsPDF {
  return pakbonDocument(gegevens(p, pl), companyApi.getSync(), documentAssets())
}

export function picklistPdf(p: Project, pl: Paklijst): jsPDF {
  return picklistDocument(gegevens(p, pl), companyApi.getSync(), documentAssets())
}

export const pakbonBestandsnaam = (pl: Paklijst) => `Pakbon-${pl.id}.pdf`
export const picklistBestandsnaam = (pl: Paklijst) => `Picklist-${pl.id}.pdf`
