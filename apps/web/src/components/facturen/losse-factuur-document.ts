import type jsPDF from 'jspdf'
import { heeftFactuurnummer, type Relatie, type User, type VerkoopFactuur } from '@stockmanager/shared'
import { companyApi } from '../../api/company'
import { articlesApi } from '../../api/articles'
import { relatiesApi } from '../../api/relaties'
import { documentAssets } from '../../services/document/assets'
import { factuurDocument, pakbonDocument } from '../../services/document/documenten'
import { pdfToBase64 } from '../../services/graph-mail'
import type { EmlMail } from '../../services/eml'
import { afleverAdres, factuurAdres, materiaalVan, notitieVan } from '../../features/projects/detail/lib/document-gegevens'
import { factuurBestandsnaam } from '../../features/projects/detail/lib/factuur-document'
import { datum, eur } from '../../features/projects/detail/lib/format'

/**
 * Een losse factuur of credit als document (2026-11-18): dezelfde opmaak als
 * een projectfactuur, maar de klant komt van de factuur zelf. Plus een pakbon
 * voor in de doos, op het factuurnummer (een losse factuur heeft geen PL-nummer).
 */

const klantVan = (f: VerkoopFactuur) => {
  const relatie: Relatie | null = f.relatieId ? relatiesApi.listSync().find((r) => r.id === f.relatieId) ?? null : null
  const contact = relatie?.contacten.find((c) => c.id === f.contactId) ?? null
  return { relatie, contact }
}
const artikel = (id: string | null) => (id ? articlesApi.get(id) : null)
const nummer = (f: VerkoopFactuur) => (heeftFactuurnummer(f.id) ? f.id : null)

export function losseFactuurPdf(f: VerkoopFactuur): jsPDF {
  const { relatie } = klantVan(f)
  const lever = f.leverdatum ?? f.verzondenOp ?? null
  return factuurDocument(
    {
      soort: f.soort,
      nummer: nummer(f),
      datum: f.verzondenOp ?? f.createdAt,
      vervaldatum: f.vervaldatum,
      crediteert: f.crediteertFactuurId,
      klant: {
        naam: relatie?.naam ?? f.klantNaam ?? 'Klant onbekend',
        regels: [...factuurAdres(relatie), relatie?.btw ? `BTW ${relatie.btw}` : null].filter((x): x is string => Boolean(x)),
      },
      referentie: f.klantRef,
      project: null,
      leverdatum: f.soort === 'factuur' && lever ? datum(lever) : null,
      pakbonnen: [],
      regels: f.regels.map((r) => {
        const a = artikel(r.artikelId)
        return { naam: r.naam, notitie: notitieVan(null, a), materiaal: materiaalVan(a), qty: r.qty, eenheid: r.eenheid, prijs: r.verkoopprijs, totaal: r.totaal }
      }),
      btwPct: f.btwPct,
      subtotaal: f.subtotaal,
      btw: f.btwBedrag,
      totaal: f.totaalInclBtw,
      notities: [f.soort === 'credit' && f.reden ? `Reden: ${f.reden}` : '', f.notities].filter(Boolean).join('\n'),
    },
    companyApi.getSync(),
    documentAssets(),
  )
}

/** Pakbon voor in de doos: geen prijzen, wel wat erin zit en waar het heen gaat. */
export function lossePakbonPdf(f: VerkoopFactuur): jsPDF {
  const { relatie, contact } = klantVan(f)
  const naam = relatie?.naam ?? f.klantNaam ?? 'Klant onbekend'
  return pakbonDocument(
    {
      nummer: nummer(f) ?? 'Concept',
      nummerLabel: 'Factuurnr.',
      datum: f.leverdatum ?? f.verzondenOp ?? new Date().toISOString(),
      klantNaam: naam,
      aflever: { naam, regels: [...(contact?.naam ? [`t.a.v. ${contact.naam}`] : []), ...afleverAdres(relatie)] },
      referentie: f.klantRef,
      order: null,
      project: null,
      regels: f.regels.map((r) => {
        const a = artikel(r.artikelId)
        return {
          naam: r.naam, notitie: notitieVan(null, a), materiaal: materiaalVan(a), locatie: a?.locatie ?? null,
          besteld: r.qty, qty: r.qty, restant: 0, eenheid: r.eenheid,
        }
      }),
      notities: f.notities,
    },
    companyApi.getSync(),
    documentAssets(),
  )
}

export const pakbonBestandsnaam = (f: VerkoopFactuur) => `Pakbon-${nummer(f) ?? 'concept'}.pdf`

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** De mail in Outlook, naar het adres op de factuur, met de factuur als bijlage. */
export function losseFactuurMail(f: VerkoopFactuur, gebruiker: Pick<User, 'name' | 'achternaam' | 'titel'> | null): EmlMail {
  const { contact } = klantVan(f)
  const co = companyApi.getSync()
  const credit = f.soort === 'credit'
  const naar = f.naarEmail
  const aanhef = contact?.email && naar && contact.email.trim().toLowerCase() === naar.trim().toLowerCase()
    ? `Beste ${esc(contact.naam)}` : 'Geachte heer, mevrouw'
  const ref = f.klantRef ? ` (uw referentie ${esc(f.klantRef)})` : ''
  const handtekening = [gebruiker?.name, gebruiker?.achternaam].filter(Boolean).join(' ')
  const html = [
    `<p>${aanhef},</p>`,
    credit
      ? `<p>Bijgaand onze creditfactuur <strong>${esc(f.id)}</strong>${f.crediteertFactuurId ? ` op factuur ${esc(f.crediteertFactuurId)}` : ''}${ref}`
        + `, groot ${eur(f.totaalInclBtw)} incl. btw.${f.reden ? ` ${esc(f.reden)}.` : ''}</p>`
      : `<p>Bijgaand onze factuur <strong>${esc(f.id)}</strong>${ref}, groot ${eur(f.totaalInclBtw)} incl. btw.</p>`,
    !credit && f.vervaldatum
      ? `<p>Wij verzoeken u het bedrag vóór ${datum(f.vervaldatum)} over te maken${co.iban ? ` op ${esc(co.iban)}` : ''} onder vermelding van ${esc(f.id)}.</p>`
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
    onderwerp: `${credit ? 'Creditfactuur' : 'Factuur'} ${f.id}${f.klantRef ? ` — uw ref. ${f.klantRef}` : ''}`,
    html,
    bijlage: { naam: factuurBestandsnaam(f), type: 'application/pdf', base64: pdfToBase64(losseFactuurPdf(f)) },
  }
}
