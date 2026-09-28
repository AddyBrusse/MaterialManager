import type jsPDF from 'jspdf'
import type { Project, User } from '@stockmanager/shared'
import { relatiesApi } from '../../../../api/relaties'
import { companyApi } from '../../../../api/company'
import { buildOpdrachtbevestigingPdf } from '../../../../services/opdrachtbevestiging-pdf'
import { pdfToBase64 } from '../../../../services/graph-mail'
import type { EmlMail } from '../../../../services/eml'
import { datum } from './format'

/**
 * De opdrachtbevestiging als document: de pdf, en de mail die hem naar de
 * klant brengt. Eén plek, zodat openen, downloaden en mailen dezelfde pdf
 * opleveren — wat je in het venster ziet is wat de klant krijgt.
 */

function klantVan(p: Project) {
  const relatie = p.relatieId ? relatiesApi.listSync().find(r => r.id === p.relatieId) ?? null : null
  const contact = relatie?.contacten.find(c => c.id === p.contactId) ?? null
  return { relatie, contact }
}

/** "OFF-2026-026 v4" — het nummer dat de klant van de offerte kent. */
export function offerteLabel(p: Project): string | null {
  const ob = p.opdrachtbevestiging
  if (!ob) return null
  const o = p.offertes.find(x => x.id === ob.offerteId)
  return o ? `${o.documentNr} v${o.versie}` : ob.offerteId
}

export function obPdf(p: Project): jsPDF {
  const ob = p.opdrachtbevestiging
  if (!ob) throw new Error('Er is nog geen opdrachtbevestiging op dit project.')
  const { relatie, contact } = klantVan(p)
  return buildOpdrachtbevestigingPdf(
    {
      id: p.id,
      naam: p.naam,
      klantNaam: relatie?.naam,
      contactNaam: contact?.naam,
      levertijdDatum: p.levertijdDatum,
      offerteLabel: offerteLabel(p) ?? undefined,
    },
    ob,
  )
}

export function obBestandsnaam(p: Project): string {
  return `Opdrachtbevestiging-${p.opdrachtbevestiging?.id ?? p.id}.pdf`
}

const esc = (t: string) =>
  t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/**
 * De mail zoals hij in Outlook klaarstaat. Aan wie: de contactpersoon, anders
 * het algemene adres van de klant. Is er geen adres, dan blijft "Aan" leeg en
 * vul je het in Outlook in — de mail staat er toch klaar.
 */
export function obMail(p: Project, gebruiker: Pick<User, 'name' | 'achternaam' | 'titel'> | null): EmlMail {
  const ob = p.opdrachtbevestiging
  if (!ob) throw new Error('Er is nog geen opdrachtbevestiging op dit project.')
  const { relatie, contact } = klantVan(p)
  const co = companyApi.getSync()
  const naar = contact?.email || relatie?.email || null
  const aanhef = contact?.naam ? `Beste ${esc(contact.naam)}` : 'Geachte relatie'
  const handtekening = [gebruiker?.name, gebruiker?.achternaam].filter(Boolean).join(' ')
  const html = [
    `<p>${aanhef},</p>`,
    `<p>Bijgaand onze opdrachtbevestiging <strong>${esc(ob.id)}</strong> voor ${esc(p.naam)}`
      + (ob.opdrachtRef ? `, naar aanleiding van uw opdracht <strong>${esc(ob.opdrachtRef)}</strong>` : '')
      + '.</p>',
    '<p>Wij voeren de opdracht uit volgens de bijgevoegde specificaties.</p>',
    p.levertijdDatum ? `<p><strong>Levertijd:</strong> ${datum(p.levertijdDatum)}</p>` : '',
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
    onderwerp: `Opdrachtbevestiging ${ob.id} — ${p.naam}`,
    html,
    bijlage: { naam: obBestandsnaam(p), type: 'application/pdf', base64: pdfToBase64(obPdf(p)) },
  }
}
