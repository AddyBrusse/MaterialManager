import type jsPDF from 'jspdf'
import type { Factuur, Project, User } from '@stockmanager/shared'
import { relatiesApi } from '../../../../api/relaties'
import { companyApi } from '../../../../api/company'
import { buildFactuurPdf } from '../../../../services/factuur-pdf'
import { pdfToBase64 } from '../../../../services/graph-mail'
import type { EmlMail } from '../../../../services/eml'
import { datum, eur } from './format'

/**
 * De factuur als document: de pdf en de mail die hem brengt (2026-10-03).
 * Eén plek, zodat openen, downloaden en mailen dezelfde pdf opleveren.
 */

function klantVan(p: Project) {
  const relatie = p.relatieId ? relatiesApi.listSync().find(r => r.id === p.relatieId) ?? null : null
  const contact = relatie?.contacten.find(c => c.id === p.contactId) ?? null
  return { relatie, contact }
}

/** Het factuuradres: apart ingevuld bij de klant, anders het vestigingsadres. */
function factuurAdres(r: ReturnType<typeof klantVan>['relatie']): string[] {
  if (!r) return []
  const apart = r.factuurAdresZelfde === false
  const straat = apart ? r.factuurStraat : r.straat
  const pc = apart ? r.factuurPostcode : r.postcode
  const stad = apart ? r.factuurStad : r.stad
  const land = apart ? r.factuurLand : r.land
  return [straat, [pc, stad].filter(Boolean).join('  '), land && land !== 'Nederland' ? land : null]
    .filter((x): x is string => Boolean(x))
}

export function factuurPdf(p: Project, f: Factuur): jsPDF {
  const { relatie } = klantVan(p)
  return buildFactuurPdf(f, {
    naam: relatie?.naam ?? null,
    adres: factuurAdres(relatie),
    btw: relatie?.btw ?? null,
    referentie: p.opdrachtbevestiging?.opdrachtRef || p.klantRef || null,
    projectLabel: `${p.id} — ${p.naam}`,
    crediteert: f.crediteertFactuurId,
  })
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
