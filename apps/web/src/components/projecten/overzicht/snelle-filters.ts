import type { Project } from '@stockmanager/shared'
import { dagVan, heeftSignaal, SIGNAAL_LABEL, type SignaalId, type Signalen } from './signalen'
import { zelfde, type Filter } from './filters'

/**
 * De filters die het rechtermuisknopmenu bij een rij aanbiedt (2026-10-05):
 * alleen wat voor díe rij iets betekent — zijn klant, contact, status, de
 * periode van zijn levertijd en de signalen die op hem gelden. Wat al als chip
 * aanstaat, staat er niet nog eens bij.
 *
 * De kolom waarop je klikte komt bovenaan: rechts op "Jansen BV" bedoelt
 * bijna altijd "alleen Jansen BV".
 */
export interface SnelFilter {
  filter: Filter
  /** Tekst in het menu, zonder "is"/"is niet" — dat zegt de knop. */
  label: string
  /** Of "alles behalve" er ook bij kan (≠-knopje). */
  omkeerbaar: boolean
}

/** Bij welke kolom een signaal hoort, voor "de kolom waarop je klikte eerst". */
const KOLOM_VAN_SIGNAAL: Partial<Record<SignaalId, string>> = {
  teFactureren: 'teFactureren',
  openstaand: 'openstaand',
  vervallen: 'openstaand',
  overLevertijd: 'levertijd',
  levertijdWeek: 'levertijd',
  geenReactie: 'offerteStatus',
  offerteVerloopt: 'offerteStatus',
  onHold: 'status',
}

/** Volgorde van de signalen in het menu: eerst wat om actie vraagt. */
const SIGNAAL_VOLGORDE: SignaalId[] = [
  'overLevertijd', 'geenReactie', 'vervallen', 'teFactureren', 'teLeveren', 'vrijTeGeven',
  'wachtMateriaal', 'offerteVerloopt', 'levertijdWeek', 'openstaand',
]

function plusDagen(d: Date, n: number): string {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return dagVan(x)
}

export function snelleFilters(p: Project, opties: {
  kolomId: string | null
  signalen: Signalen
  nu: Date
  actief: Filter[]
  klantNaam: string
  contactNaam: string
  statusLabel: string
}): SnelFilter[] {
  const { kolomId, signalen, nu, actief } = opties
  const lijst: (SnelFilter & { kolom: string })[] = []

  if (p.relatieId) {
    lijst.push({ kolom: 'klant', filter: { soort: 'klant', relatieId: p.relatieId }, label: `Klant: ${opties.klantNaam || 'onbekend'}`, omkeerbaar: true })
  }
  if (p.contactId) {
    lijst.push({ kolom: 'contact', filter: { soort: 'contact', contactId: p.contactId }, label: `Contact: ${opties.contactNaam || 'onbekend'}`, omkeerbaar: true })
  }
  lijst.push({ kolom: 'status', filter: { soort: 'status', status: p.status }, label: `Status: ${opties.statusLabel}`, omkeerbaar: true })

  const lt = p.levertijdDatum?.slice(0, 10)
  if (lt) {
    const vandaag = dagVan(nu)
    const periode = lt < vandaag ? 'voorbij' : lt <= plusDagen(nu, 7) ? 'week' : lt <= plusDagen(nu, 30) ? 'maand' : null
    const tekst = { voorbij: 'voorbij', week: 'binnen 7 dagen', maand: 'binnen 30 dagen' }
    if (periode) {
      lijst.push({ kolom: 'levertijd', filter: { soort: 'levertijd', periode }, label: `Levertijd: ${tekst[periode]}`, omkeerbaar: false })
    }
  }

  for (const id of SIGNAAL_VOLGORDE) {
    if (!heeftSignaal(signalen, id)) continue
    lijst.push({ kolom: KOLOM_VAN_SIGNAAL[id] ?? '', filter: { soort: 'signaal', signaal: id }, label: SIGNAAL_LABEL[id], omkeerbaar: true })
  }

  const open = lijst.filter((s) => !actief.some((a) => zelfde(a, s.filter)))
  // Stabiel sorteren: de aangeklikte kolom naar voren, verder de volgorde hierboven.
  const eerst = open.filter((s) => kolomId && s.kolom === kolomId)
  const rest = open.filter((s) => !(kolomId && s.kolom === kolomId))
  return [...eerst, ...rest].map(({ kolom: _kolom, ...s }) => s)
}
