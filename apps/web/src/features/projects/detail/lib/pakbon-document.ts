import type jsPDF from 'jspdf'
import { basisRegels, type Paklijst, type Project, type User } from '@stockmanager/shared'
import { pdfToBase64 } from '../../../../services/graph-mail'
import type { EmlMail } from '../../../../services/eml'
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

const esc = (t: string) =>
  t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/**
 * Naar wie de pakbon gaat: de contactpersoon van de order (afgesproken
 * 2026-10-05). Geen terugval op het algemene adres van de klant — wie de
 * levering verwacht, is degene die besteld heeft.
 */
export function pakbonMailadres(p: Project): string | null {
  return klantVan(p).contact?.email?.trim() || null
}

/** Waarom er geen pakbonmail klaargezet kan worden, of `null`. Zegt wat er eerst moet. */
export function waaromGeenPakbonMail(p: Project): string | null {
  const { relatie, contact } = klantVan(p)
  if (!relatie) return 'Dit project heeft nog geen klant. Kies eerst een klant en contactpersoon op het project.'
  if (!contact) return `Er staat geen contactpersoon op dit project. Kies er een bij ${relatie.naam}; de pakbon gaat naar die persoon.`
  if (!contact.email?.trim()) return `${contact.naam} heeft geen mailadres. Vul het in bij de relatie ${relatie.naam}.`
  return null
}

/** De mail zoals hij in Outlook klaarstaat, met de pakbon-pdf erin (2026-10-05). */
export function pakbonMail(
  p: Project, pl: Paklijst, gebruiker: Pick<User, 'name' | 'achternaam' | 'titel'> | null,
): EmlMail {
  const { contact } = klantVan(p)
  const co = companyApi.getSync()
  const ref = p.opdrachtbevestiging?.opdrachtRef || p.klantRef
  const deel = p.paklijsten.filter((x) => x.regels.length > 0).length > 1
  const handtekening = [gebruiker?.name, gebruiker?.achternaam].filter(Boolean).join(' ')
  const html = [
    `<p>${contact?.naam ? `Beste ${esc(contact.naam)}` : 'Geachte heer, mevrouw'},</p>`,
    `<p>Bijgaand pakbon <strong>${esc(pl.id)}</strong> voor ${esc(p.naam)}`
      + `${ref ? ` (uw referentie ${esc(ref)})` : ''}`
      + `${deel ? '. Dit is een deellevering; op de pakbon staat per regel wat er nog volgt' : ''}.</p>`,
    '<p>Met vriendelijke groet,<br>'
      + (handtekening ? `<strong>${esc(handtekening)}</strong>` : '')
      + (gebruiker?.titel ? `<br>${esc(gebruiker.titel)}` : '')
      + `<br>${esc(co.naam ?? '')}`
      + (co.telefoon ? `<br>${esc(co.telefoon)}` : '')
      + (co.email ? `<br>${esc(co.email)}` : '')
      + '</p>',
  ].join('\n')

  return {
    naar: pakbonMailadres(p),
    onderwerp: `Pakbon ${pl.id} — ${p.naam}${ref ? ` — uw ref. ${ref}` : ''}`,
    html,
    bijlage: { naam: pakbonBestandsnaam(pl), type: 'application/pdf', base64: pdfToBase64(pakbonPdf(p, { ...pl, verzondenOp: pl.verzondenOp ?? new Date().toISOString() })) },
  }
}
