import type jsPDF from 'jspdf'
import type { Offerte, Project, User } from '@stockmanager/shared'
import { companyApi } from '../../../../api/company'
import { documentAssets } from '../../../../services/document/assets'
import { offerteDocument } from '../../../../services/document/documenten'
import { pdfToBase64 } from '../../../../services/graph-mail'
import type { EmlMail } from '../../../../services/eml'
import { klantPartij, klantVan, prijsRegel } from './document-gegevens'
import { datum, eur } from './format'

/**
 * De offerte als document (2026-10-05): de pdf in de huisstijl van het
 * template, en de mail die hem naar de klant brengt. Tot nu toe zette
 * "Versturen" alleen de status; er ging niets de deur uit.
 */

/** "OFF-2026-012", met "v2" erachter vanaf de tweede versie. */
export function offerteNummer(o: Offerte): string {
  return o.versie > 1 ? `${o.documentNr} v${o.versie}` : o.documentNr
}

export function offertePdf(p: Project, o: Offerte): jsPDF {
  return offerteDocument(
    {
      nummer: offerteNummer(o),
      datum: o.verzondenOp ?? o.createdAt,
      geldigTot: o.geldigTot,
      klant: klantPartij(p),
      referentie: o.externeRef || p.klantRef,
      leverdatum: p.levertijdDatum,
      regels: o.regels.map(prijsRegel),
      notities: o.notities,
    },
    companyApi.getSync(),
    documentAssets(),
  )
}

export function offerteBestandsnaam(o: Offerte): string {
  return `Offerte-${offerteNummer(o).replace(' ', '-')}.pdf`
}

/** Waar de offerte heen gaat: het offerte-adres van de klant, anders de contactpersoon, anders algemeen. */
export function offerteMailadres(p: Project): string | null {
  const { relatie, contact } = klantVan(p)
  return relatie?.emailOfferte || contact?.email || relatie?.email || null
}

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function offerteMail(p: Project, o: Offerte, gebruiker: Pick<User, 'name' | 'achternaam' | 'titel'> | null): EmlMail {
  const { contact } = klantVan(p)
  const co = companyApi.getSync()
  const naar = offerteMailadres(p)
  const aanhef =
    contact?.naam && (!naar || naar === contact.email) ? `Beste ${esc(contact.naam)}` : 'Geachte heer, mevrouw'
  const ref = o.externeRef || p.klantRef
  const totaal = o.regels.reduce((s, r) => s + r.totaal, 0)
  const handtekening = [gebruiker?.name, gebruiker?.achternaam].filter(Boolean).join(' ')
  const html = [
    `<p>${aanhef},</p>`,
    `<p>Bijgaand onze offerte <strong>${esc(offerteNummer(o))}</strong> voor ${esc(p.naam)}`
      + (ref ? `, naar aanleiding van uw aanvraag <strong>${esc(ref)}</strong>` : '')
      + `, groot ${eur(totaal)} excl. btw.</p>`,
    o.geldigTot ? `<p>De offerte is geldig tot ${datum(o.geldigTot)}.</p>` : '',
    '<p>Heeft u vragen, neem dan gerust contact met ons op.</p>',
    '<p>Met vriendelijke groet,<br>'
      + (handtekening ? `<strong>${esc(handtekening)}</strong>` : '')
      + (gebruiker?.titel ? `<br>${esc(gebruiker.titel)}` : '')
      + `<br>${esc(co.naam ?? '')}`
      + (co.telefoon ? `<br>${esc(co.telefoon)}` : '')
      + (co.email ? `<br>${esc(co.email)}` : '')
      + '</p>',
  ].filter(Boolean).join('\n')

  return {
    naar,
    onderwerp: `Offerte ${offerteNummer(o)} — ${p.naam}${ref ? ` — uw ref. ${ref}` : ''}`,
    html,
    bijlage: { naam: offerteBestandsnaam(o), type: 'application/pdf', base64: pdfToBase64(offertePdf(p, o)) },
  }
}
