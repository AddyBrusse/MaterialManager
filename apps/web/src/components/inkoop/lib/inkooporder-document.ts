import type jsPDF from 'jspdf'
import type { Inkooporder, User } from '@stockmanager/shared'
import { companyApi } from '../../../api/company'
import { relatiesApi } from '../../../api/relaties'
import { pdfToBase64 } from '../../../services/graph-mail'
import type { EmlMail } from '../../../services/eml'
import { documentAssets } from '../../../services/document/assets'
import { inkooporderDocument } from '../../../services/document/documenten'
import { factuurAdres } from '../../../features/projects/detail/lib/document-gegevens'

/** De inkooporder als pdf en als mail in Outlook (2026-10-06, deel 3b). */

const mm = (n: number) => `${n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mm`

export function inkooporderPdf(o: Inkooporder): jsPDF {
  const relatie = relatiesApi.listSync().find((r) => r.id === o.leverancierId) ?? null
  return inkooporderDocument({
    nummer: o.id,
    materiaalNummers: o.regels.map((r) => r.materiaalNummer),
    datum: o.verzondenOp ?? new Date().toISOString(),
    gewensteLevering: null,
    leverancier: { naam: o.leverancierNaam, regels: factuurAdres(relatie) },
    referentie: o.referentie,
    metPrijzen: true,
    regels: o.regels.map((r) => ({
      naam: `${r.materiaal}${r.exoot ? ' (op maat)' : ''}`,
      notitie: [r.materiaalNummer ? null : r.referentie, r.uitleg, r.levertijdDagen != null ? `levertijd ${r.levertijdDagen} werkdagen` : null].filter(Boolean).join(' · '),
      materiaal: mm(r.lengteMm),
      qty: r.stuks,
      eenheid: 'st',
      prijs: r.totaal / Math.max(1, r.stuks),
      totaal: r.totaal,
    })),
    notities: o.notitie ?? '',
  }, companyApi.getSync(), documentAssets())
}

export const inkooporderBestandsnaam = (o: Inkooporder) => `Inkooporder-${o.id}.pdf`

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function inkooporderMail(o: Inkooporder, gebruiker: Pick<User, 'name' | 'achternaam' | 'titel'> | null): EmlMail {
  const co = companyApi.getSync()
  const naam = [gebruiker?.name, gebruiker?.achternaam].filter(Boolean).join(' ')
  const html = [
    '<p>Geachte heer, mevrouw,</p>',
    `<p>Hierbij bestellen wij volgens bijgaande inkooporder <strong>${esc(o.id)}</strong>`
      + `${o.referentie ? ` (uw prijsopgave op ${esc(o.referentie)})` : ''}. Graag een orderbevestiging met de leverdatum.</p>`,
    ...(o.regels.some((r) => r.materiaalNummer)
      ? [`<p>Wilt u op elk stuk ons nummer zetten (kolom "Ons nr." op de inkooporder: ${o.regels.map((r) => esc(r.materiaalNummer ?? '')).filter(Boolean).join(', ')})? Dan boeken we het bij ontvangst meteen goed in.</p>`]
      : []),
    '<p>Met vriendelijke groet,<br>'
      + (naam ? `<strong>${esc(naam)}</strong>` : '')
      + (gebruiker?.titel ? `<br>${esc(gebruiker.titel)}` : '')
      + `<br>${esc(co.naam ?? '')}`
      + (co.telefoon ? `<br>${esc(co.telefoon)}` : '')
      + (co.email ? `<br>${esc(co.email)}` : '')
      + '</p>',
  ].join('\n')
  return {
    naar: o.email,
    onderwerp: `Inkooporder ${o.id} — ${co.naam ?? ''}`.trim(),
    html,
    bijlage: { naam: inkooporderBestandsnaam(o), type: 'application/pdf', base64: pdfToBase64(inkooporderPdf(o)) },
  }
}
