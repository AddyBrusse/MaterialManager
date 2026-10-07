import type { BestelRegel } from '../schemas/bestelling'
import type { Inkooporder, InkooporderRegel } from '../schemas/inkooporder'

/**
 * Voorwaarden voor inkooporders (2026-10-06, deel 3b). Scherm en server vragen
 * hetzelfde; de server antwoordt met dezelfde zin als 409 VOORWAARDE.
 */

type RegelVoorOrder = Pick<BestelRegel, 'materiaal' | 'status' | 'keuze' | 'inkooporder'>

/** Waarom deze regels geen inkooporder kunnen worden, of `null`. */
export function waaromNietInkooporder(regels: RegelVoorOrder[]): string | null {
  if (regels.length === 0) return 'Kies eerst één of meer regels.'
  const zonder = regels.find((r) => !r.keuze)
  if (zonder) return `Voor ${zonder.materiaal} is nog geen leverancier gekozen.`
  const al = regels.find((r) => r.inkooporder)
  if (al) return `${al.materiaal} staat al op ${al.inkooporder!.id}. Trek die eerst in als je hem opnieuw wilt bestellen.`
  const klaar = regels.find((r) => r.status === 'besteld' || r.status === 'ontvangen')
  if (klaar) return `${klaar.materiaal} is al besteld.`
  return null
}

/** Een concept mag nog veranderen; verstuurd ligt vast. */
export function waaromNietInkoopWijzigen(o: Pick<Inkooporder, 'id' | 'status'>): string | null {
  if (o.status === 'concept') return null
  if (o.status === 'vervallen') return `${o.id} is ingetrokken; maak een nieuwe inkooporder.`
  return `${o.id} is verstuurd en ligt vast. Trek hem in en maak een nieuwe als er iets moet veranderen.`
}

export function waaromNietInkoopVersturen(o: Pick<Inkooporder, 'id' | 'status' | 'email' | 'leverancierNaam' | 'regels'>): string | null {
  if (o.status === 'vervallen') return `${o.id} is ingetrokken en gaat niet meer de deur uit.`
  if (o.regels.length === 0) return `${o.id} heeft geen regels meer.`
  if (!o.email) return `Bij ${o.leverancierNaam} staat geen e-mailadres. Vul het in bij Relaties → ${o.leverancierNaam} (of bij een contactpersoon).`
  return null
}

/** Intrekken kan bij een verstuurde order, zolang er nog niets binnen is. */
export function waaromNietInkoopIntrekken(o: Pick<Inkooporder, 'id' | 'status' | 'regels'>): string | null {
  if (o.status === 'concept') return `${o.id} is nog een concept; dat pas je aan of verwijder je.`
  if (o.status === 'vervallen') return `${o.id} is al ingetrokken.`
  const binnen = o.regels.find((r) => r.ontvangenStuks > 0)
  if (binnen) return `Van ${binnen.referentie} is al iets ontvangen. Wat binnen is staat in de voorraad; die order trek je niet meer in.`
  return null
}

export const openStuks = (r: Pick<InkooporderRegel, 'stuks' | 'ontvangenStuks'>) => Math.max(0, r.stuks - r.ontvangenStuks)

export function waaromNietOntvangen(o: Pick<Inkooporder, 'id' | 'status'>, r: Pick<InkooporderRegel, 'referentie' | 'stuks' | 'ontvangenStuks'>, stuks: number): string | null {
  if (o.status === 'concept') return `${o.id} is nog niet verstuurd. Verstuur hem eerst; dan kan er iets binnenkomen.`
  if (o.status === 'vervallen') return `${o.id} is ingetrokken.`
  const open = openStuks(r)
  if (open === 0) return `${r.referentie} is al helemaal binnen.`
  if (!Number.isInteger(stuks) || stuks < 1) return 'Vul in hoeveel stuks er binnen zijn (minstens 1).'
  if (stuks > open) return `Er staan nog ${open} stuks open op ${r.referentie}; meer kan er niet binnenkomen.`
  return null
}

/** Status van een bestelregel na ontvangst: alles binnen → ontvangen. */
export const statusNaOntvangst = (stuks: number, ontvangen: number): 'ontvangen' | 'besteld' => (ontvangen >= stuks ? 'ontvangen' : 'besteld')

/** De leverdatum aanpassen kan zolang een verstuurde order nog niet helemaal binnen is. */
export function waaromNietLeverdatum(o: Pick<Inkooporder, 'id' | 'status'>, r: Pick<InkooporderRegel, 'referentie' | 'stuks' | 'ontvangenStuks'>, datum: string | null): string | null {
  if (o.status === 'concept') return `${o.id} is nog niet verstuurd; de leverdatum volgt uit de levertijd zodra hij de deur uit is.`
  if (o.status === 'vervallen') return `${o.id} is ingetrokken.`
  if (openStuks(r) === 0) return `${r.referentie} is al helemaal binnen.`
  if (datum != null && !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return 'Vul een datum in.'
  return null
}
