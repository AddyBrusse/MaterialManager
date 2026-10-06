import type jsPDF from 'jspdf'
import type { BestelRegel, Prijsaanvraag, PrijsaanvraagLeverancier, User } from '@stockmanager/shared'
import { companyApi } from '../../../api/company'
import { relatiesApi } from '../../../api/relaties'
import { pdfToBase64 } from '../../../services/graph-mail'
import type { EmlMail } from '../../../services/eml'
import { documentAssets } from '../../../services/document/assets'
import { prijsaanvraagDocument } from '../../../services/document/documenten'
import { factuurAdres } from '../../../features/projects/detail/lib/document-gegevens'

/** Prijsaanvraag als pdf en als mail in Outlook, één per leverancier (2026-10-06). */

const mm = (n: number) => `${n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mm`

export function prijsaanvraagPdf(a: Prijsaanvraag, l: PrijsaanvraagLeverancier, regels: BestelRegel[]): jsPDF {
  const relatie = relatiesApi.listSync().find((r) => r.id === l.leverancierId) ?? null
  const eigen = regels.filter((r) => a.regelIds.includes(r.id))
  const nodig = eigen.map((r) => r.nodigVoor).filter((d): d is string => !!d).sort()[0] ?? null
  return prijsaanvraagDocument({
    nummer: a.id,
    datum: l.verzondenOp ?? new Date().toISOString(),
    leverancier: { naam: l.naam, regels: factuurAdres(relatie) },
    regels: eigen.map((r) => ({
      materiaal: `${r.gradeNaam} ${r.profielNaam}${r.exoot ? ' (op maat)' : ''}`,
      maat: r.materiaal.slice(`${r.gradeNaam} ${r.profielNaam} `.length),
      lengte: mm(r.lengteMm),
      qty: r.stuks,
      notitie: r.notitie,
    })),
    nodigVoor: nodig,
    notities: a.notitie,
  }, companyApi.getSync(), documentAssets())
}

export const prijsaanvraagBestandsnaam = (a: Prijsaanvraag, l: PrijsaanvraagLeverancier) =>
  `Prijsaanvraag-${a.id}-${l.naam.replace(/[^\w-]+/g, '_')}.pdf`

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function prijsaanvraagMail(
  a: Prijsaanvraag, l: PrijsaanvraagLeverancier, regels: BestelRegel[],
  gebruiker: Pick<User, 'name' | 'achternaam' | 'titel'> | null,
): EmlMail {
  const co = companyApi.getSync()
  const naam = [gebruiker?.name, gebruiker?.achternaam].filter(Boolean).join(' ')
  const html = [
    '<p>Geachte heer, mevrouw,</p>',
    `<p>Graag ontvangen wij uw prijs en levertijd voor de regels in bijgaande prijsaanvraag <strong>${esc(a.id)}</strong>: `
      + 'per regel een prijs per kg, per stuk of in totaal, en eventuele zaagkosten per snede.</p>',
    '<p>Met vriendelijke groet,<br>'
      + (naam ? `<strong>${esc(naam)}</strong>` : '')
      + (gebruiker?.titel ? `<br>${esc(gebruiker.titel)}` : '')
      + `<br>${esc(co.naam ?? '')}`
      + (co.telefoon ? `<br>${esc(co.telefoon)}` : '')
      + (co.email ? `<br>${esc(co.email)}` : '')
      + '</p>',
  ].join('\n')
  return {
    naar: l.email,
    onderwerp: `Prijsaanvraag ${a.id} — ${co.naam ?? ''}`.trim(),
    html,
    bijlage: { naam: prijsaanvraagBestandsnaam(a, l), type: 'application/pdf', base64: pdfToBase64(prijsaanvraagPdf(a, l, regels)) },
  }
}
