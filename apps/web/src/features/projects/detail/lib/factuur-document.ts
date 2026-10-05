import type jsPDF from 'jspdf'
import type { Factuur, Project, User } from '@stockmanager/shared'
import { companyApi } from '../../../../api/company'
import { documentAssets } from '../../../../services/document/assets'
import { factuurDocument } from '../../../../services/document/documenten'
import { artikelVanRegel, factuurAdres, klantVan, materiaalVan, notitieVan } from './document-gegevens'
import { pdfToBase64 } from '../../../../services/graph-mail'
import type { EmlMail } from '../../../../services/eml'
import { datum, eur } from './format'

/**
 * De factuur als document: de pdf en de mail die hem brengt (2026-10-03).
 * Eén plek, zodat openen, downloaden en mailen dezelfde pdf opleveren.
 */

export function factuurPdf(p: Project, f: Factuur): jsPDF {
  const { relatie } = klantVan(p)
  return factuurDocument(
    {
      soort: f.soort,
      nummer: f.id,
      datum: f.verzondenOp ?? f.createdAt,
      vervaldatum: f.vervaldatum,
      crediteert: f.crediteertFactuurId,
      klant: {
        naam: relatie?.naam ?? p.naam,
        regels: [...factuurAdres(relatie), relatie?.btw ? `BTW ${relatie.btw}` : null].filter((x): x is string => Boolean(x)),
      },
      referentie: p.opdrachtbevestiging?.opdrachtRef || p.klantRef || null,
      project: p.naam,
      regels: f.regels.map((r) => {
        const artikel = artikelVanRegel(p, r.offerteRegelId)
        return {
          naam: r.naam,
          notitie: notitieVan(null, artikel),
          materiaal: materiaalVan(artikel),
          qty: r.qty,
          eenheid: r.eenheid,
          prijs: r.verkoopprijs,
          totaal: r.totaal,
        }
      }),
      btwPct: f.btwPct,
      subtotaal: f.subtotaal,
      btw: f.btwBedrag,
      totaal: f.totaalInclBtw,
      notities: f.notities,
    },
    companyApi.getSync(),
    documentAssets(),
  )
}

export function factuurBestandsnaam(f: Factuur): string {
  return `${f.soort === 'credit' ? 'Creditfactuur' : 'Factuur'}-${f.id}.pdf`
}

const esc = (t: string) =>
  t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/**
 * De mail zoals hij in Outlook klaarstaat, naar het adres op de factuur —
 * meestal de administratie, niet de contactpersoon van de order. Daarom ook
 * geen persoonlijke aanhef als het adres niet van de contactpersoon is.
 */
export function factuurMail(
  p: Project, f: Factuur, naar: string | null, gebruiker: Pick<User, 'name' | 'achternaam' | 'titel'> | null,
): EmlMail {
  const { contact } = klantVan(p)
  const co = companyApi.getSync()
  const credit = f.soort === 'credit'
  const aanhef = contact?.email && naar && contact.email.trim().toLowerCase() === naar.trim().toLowerCase()
    ? `Beste ${esc(contact.naam)}` : 'Geachte heer, mevrouw'
  const ref = p.opdrachtbevestiging?.opdrachtRef || p.klantRef
  const handtekening = [gebruiker?.name, gebruiker?.achternaam].filter(Boolean).join(' ')
  const html = [
    `<p>${aanhef},</p>`,
    credit
      ? `<p>Bijgaand onze creditfactuur <strong>${esc(f.id)}</strong> op factuur ${esc(f.crediteertFactuurId ?? '')}, `
        + `voor ${esc(p.naam)}${ref ? ` (uw referentie ${esc(ref)})` : ''}.</p>`
      : `<p>Bijgaand onze factuur <strong>${esc(f.id)}</strong> voor ${esc(p.naam)}`
        + `${ref ? ` (uw referentie ${esc(ref)})` : ''}, groot ${eur(f.totaalInclBtw)} incl. btw.</p>`,
    !credit && f.vervaldatum
      ? `<p>Wij verzoeken u het bedrag vóór ${datum(f.vervaldatum)} over te maken`
        + (co.iban ? ` op ${esc(co.iban)}` : '') + ` onder vermelding van ${esc(f.id)}.</p>`
      : '',
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
    onderwerp: `${credit ? 'Creditfactuur' : 'Factuur'} ${f.id} — ${p.naam}${ref ? ` — uw ref. ${ref}` : ''}`,
    html,
    bijlage: { naam: factuurBestandsnaam(f), type: 'application/pdf', base64: pdfToBase64(factuurPdf(p, f)) },
  }
}
