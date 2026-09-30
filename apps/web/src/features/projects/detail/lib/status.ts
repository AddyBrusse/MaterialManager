/**
 * De statusmachine uit §4.
 *
 * Kern van het ontwerp: de status is géén invoerveld. Er is nergens een
 * statuskeuzelijst. Elke overgang is het gevolg van een document dat gemaakt,
 * verstuurd of afgevinkt wordt; de backend leidt `project.status` af en het
 * scherm toont hem alleen.
 *
 * Hier staat wat één stap terugdraaien weggooit. Wat de blauwe knop vooruit
 * doet, hangt sinds 2026-09-30 af van de tab en staat in `tab-actie.ts`.
 */

import type { Offerte, Project, ProductieOrder } from '@stockmanager/shared'
import type { Fase, TerugVM } from '../types'
import { datumKort } from './format'

export function geaccepteerdeOfferte(p: Project) {
  return p.offertes.find((o) => o.status === 'geaccepteerd') ?? null
}

/**
 * Welke verstuurde versie de footerknop accepteert, of waarom hij dat niet weet.
 *
 * Accepteren is een keuze van de klant, dus de knop verzint er geen. Is er maar
 * één verstuurde versie, dan is het die. Zijn er meer, dan telt de versie die op
 * de Offertes-tab is opengeklapt — dat is de "geselecteerde" (2026-09-30). Eerder
 * stuurde de knop je alleen naar de Offertes-tab, en stond je daar al, dan
 * gebeurde er niets.
 */
export function teAccepteren(
  p: Project,
  openVersie: string | null,
): { offerte: Offerte; reden?: undefined } | { offerte?: undefined; reden: string } {
  const verzonden = p.offertes.filter((o) => o.status === 'verzonden').sort((a, b) => a.versie - b.versie)
  if (verzonden.length === 0) return { reden: 'Er is nog geen offerte verstuurd.' }
  if (verzonden.length === 1) return { offerte: verzonden[0] }
  const open = verzonden.find((o) => o.id === openVersie)
  if (open) return { offerte: open }
  return {
    reden:
      `Er zijn ${verzonden.length} verstuurde versies (${verzonden.map((o) => `v${o.versie}`).join(', ')}) — ` +
      'klap op de Offertes-tab de versie open die de klant accepteert.',
  }
}

/** De versie waarop de productie draait: de geaccepteerde, anders de hoogste. */
export function geldendeOfferte(p: Project) {
  return (
    geaccepteerdeOfferte(p) ??
    [...p.offertes].sort((a, b) => b.versie - a.versie)[0] ??
    null
  )
}

export function stapTelling(orders: ProductieOrder[]): { gereed: number; totaal: number } {
  let gereed = 0
  let totaal = 0
  for (const o of orders) {
    for (const s of o.stappen) {
      totaal++
      if (s.gereedOp) gereed++
    }
  }
  return { gereed, totaal }
}

export function ordersGereed(orders: ProductieOrder[]): number {
  return orders.filter((o) => o.stappen.length > 0 && o.stappen.every((s) => s.gereedOp)).length
}

/**
 * Is alle productie af? Een order telt als af als hij gereedgemeld of gestopt
 * is, of als al zijn stappen afgevinkt zijn. Alleen stappen tellen gaf "0 van 1"
 * bij een order waarvan de stuks gereedgemeld waren zonder de stap af te vinken.
 */
export function productieAf(orders: ProductieOrder[]): boolean {
  return (
    orders.length > 0 &&
    orders.every(
      (o) =>
        o.status === 'gereed' ||
        o.status === 'gestopt' ||
        (o.stappen.length > 0 && o.stappen.every((s) => s.gereedOp)),
    )
  )
}

export function faseLabel(f: Fase): string {
  const map: Record<Fase, string> = {
    concept: 'Concept',
    offerte: 'Offerte',
    bevestigd: 'Bevestigd',
    productie: 'Productie',
    paklijst: 'Paklijst',
    verzonden: 'Verzonden',
    gefactureerd: 'Gefactureerd',
    on_hold: 'On hold',
    geannuleerd: 'Geannuleerd',
  }
  return map[f]
}

/** Bij on hold is álles op de pagina dicht behalve hervatten en de zijsporen. */
export function actiesGeblokkeerd(p: Project): boolean {
  return p.status === 'on_hold' || p.status === 'geannuleerd'
}

/**
 * Terugdraaien gaat altijd precies één fase terug en gooit het document weg dat
 * die fase veroorzaakte (§4.3). De knop is altijd zichtbaar; zit de terugweg
 * dicht, dan is een slotje het enige signaal en staat de uitleg in de popover —
 * geen waarschuwing die niemand gevraagd heeft.
 */
export function terugActie(p: Project): TerugVM | null {
  const blokkades: string[] = []
  const gevolgen: string[] = []
  const { gereed } = stapTelling(p.productieOrders)

  const laatstGereed = p.productieOrders
    .flatMap((o) => o.stappen)
    .filter((s) => s.gereedOp)
    .sort((a, b) => String(b.gereedOp).localeCompare(String(a.gereedOp)))[0]

  switch (p.status) {
    case 'offerte':
      gevolgen.push('Verstuurde offertes worden ingetrokken.')
      if (geaccepteerdeOfferte(p)) blokkades.push('Er is al een offerte geaccepteerd.')
      return { label: 'Terugdraaien naar Concept', naar: 'concept', blokkades, gevolgen }

    case 'bevestigd':
      gevolgen.push('De acceptatie vervalt; een bestaande opdrachtbevestiging vervalt mee.')
      if (gereed > 0) {
        blokkades.push(
          `${gereed} ${gereed === 1 ? 'stap is' : 'stappen zijn'} al afgevinkt${
            laatstGereed
              ? ` (laatste: ${laatstGereed.naam}, ${datumKort(laatstGereed.gereedOp)}${
                  laatstGereed.gereedDoor ? ` door ${laatstGereed.gereedDoor}` : ''
                })`
              : ''
          }.`,
        )
        gevolgen.push('Vrijgeven kan alleen door de afmeldingen eerst in te trekken.')
      }
      return { label: 'Terugdraaien naar Offerte', naar: 'offerte', blokkades, gevolgen }

    case 'productie':
      gevolgen.push('De productieorders vervallen.')
      if (gereed > 0) {
        blokkades.push(
          `${gereed} ${gereed === 1 ? 'stap is' : 'stappen zijn'} al afgevinkt.`,
        )
      }
      return { label: 'Terugdraaien naar Bevestigd', naar: 'bevestigd', blokkades, gevolgen }

    case 'paklijst':
      gevolgen.push('De paklijst vervalt.')
      return { label: 'Terugdraaien naar Productie', naar: 'productie', blokkades, gevolgen }

    case 'verzonden':
      gevolgen.push('De laatste verzending wordt ingetrokken.')
      if (p.facturen.length > 0) {
        blokkades.push(
          p.facturen.length === 1
            ? 'Er is al een factuur voor dit project.'
            : `Er zijn al ${p.facturen.length} facturen voor dit project.`,
        )
      }
      return { label: 'Terugdraaien naar Paklijst', naar: 'paklijst', blokkades, gevolgen }

    case 'gefactureerd':
      blokkades.push('Een verstuurde factuur draai je niet terug.')
      gevolgen.push('Een correctie gaat via een creditfactuur.')
      return { label: 'Terugdraaien naar Verzonden', naar: 'verzonden', blokkades, gevolgen }

    default:
      // concept heeft geen eerdere fase; on hold en geannuleerd draai je niet
      // terug maar hervat je met de primaire actie.
      return null
  }
}
