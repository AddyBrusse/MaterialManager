/**
 * De statusmachine uit §4.
 *
 * Kern van het ontwerp: de status is géén invoerveld. Er is nergens een
 * statuskeuzelijst. Elke overgang is het gevolg van een document dat gemaakt,
 * verstuurd of afgevinkt wordt; de backend leidt `project.status` af en het
 * scherm toont hem alleen.
 *
 * Twee dingen staan hier bij elkaar omdat ze elkaars spiegelbeeld zijn: welke
 * primaire actie er vooruit hoort, en wat één stap terugdraaien weggooit.
 */

import type { Project, ProductieOrder, ProjectVoortgang } from '@stockmanager/shared'
import { laatstePaklijst } from '@stockmanager/shared'
import type { ActieVM, Fase, TerugVM } from '../types'
import { datumKort } from './format'

export function geaccepteerdeOfferte(p: Project) {
  return p.offertes.find((o) => o.status === 'geaccepteerd') ?? null
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

function faseLabel(f: Fase): string {
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

/**
 * De primaire actie in de footer, mét de reden als hij niet kan. Die reden
 * staat er altíjd naast vóór het klikken — nooit pas in een melding achteraf.
 */
export function primaireActie(p: Project, v: ProjectVoortgang): ActieVM {
  const { gereed, totaal } = stapTelling(p.productieOrders)
  const heeftOB = Boolean(p.opdrachtbevestiging)

  switch (p.status) {
    case 'concept': {
      // Bestaat er al een concept, dan is nóg een offerte maken niet de
      // volgende stap maar een tweede lege versie. De stap is dan die versie
      // vullen en versturen.
      const concept = p.offertes.find((o) => o.status === 'concept')
      if (!concept) return { label: 'Offerte maken', kan: true }
      return {
        label: 'Offerte versturen',
        kan: concept.regels.length > 0,
        reden:
          concept.regels.length === 0
            ? `${concept.id} heeft nog geen regels — voeg eerst artikelen toe.`
            : undefined,
      }
    }

    case 'offerte': {
      const verzonden = p.offertes.some((o) => o.status === 'verzonden')
      return {
        label: 'Offerte accepteren',
        kan: verzonden,
        reden: verzonden ? undefined : 'Er is nog geen offerte verstuurd.',
      }
    }

    case 'bevestigd':
      if (!heeftOB) {
        const acc = Boolean(geaccepteerdeOfferte(p))
        return {
          label: 'Opdracht aanmaken',
          kan: acc,
          reden: acc ? undefined : 'Er is nog geen offerte geaccepteerd.',
        }
      }
      // Niet elk artikel heeft bewerkingen, dus niet elke order heeft stappen.
      // Vragen om een stap die niet bestaat is een doodlopende knop; met
      // deelleveringen is het aantal gereed dan de werkelijke volgende stap.
      if (totaal > 0) return { label: 'Stap afmelden', kan: true }
      return {
        label: 'Stuks gereedmelden',
        kan: p.productieOrders.length > 0,
        reden:
          p.productieOrders.length > 0
            ? undefined
            : 'Deze opdracht heeft nog geen productieorders.',
      }

    case 'productie': {
      // De poort is niet meer "alle stappen gereed" maar "er ligt iets klaar".
      // Bij deelleveringen gaat de eerste pakbon de deur uit terwijl de rest
      // nog op de machine staat; wachten tot alles af is zou die manier van
      // werken juist blokkeren.
      if (v.klaar > 0) {
        return { label: `Paklijst maken (${v.klaar} klaar)`, kan: true }
      }
      const openStappen = totaal - gereed
      return {
        label: 'Paklijst maken',
        kan: false,
        reden:
          v.teMaken > 0
            ? `Er ligt nog niets klaar om te leveren — ${v.teMaken} nog te maken.`
            : openStappen > 0
              ? `${openStappen} van de ${totaal} productiestappen zijn nog niet gereed.`
              : 'Alles wat gemaakt is, is al geleverd.',
      }
    }

    case 'paklijst': {
      const open = laatstePaklijst(p)
      return {
        label: 'Paklijst versturen',
        kan: Boolean(open && !open.verzondenOp),
        reden: open && open.verzondenOp ? 'De laatste paklijst is al verzonden.' : undefined,
      }
    }

    case 'verzonden': {
      // Met deelleveringen kan er meer dan één pakbon zijn; factureren mag
      // zodra er íets geleverd is dat nog niet gefactureerd is.
      const verzonden = p.paklijsten.some((pl) => pl.verzondenOp)
      if (!verzonden) {
        return { label: 'Factureren', kan: false, reden: 'De paklijst is nog niet verzonden.' }
      }
      return {
        label: v.teFactureren > 0 ? `Factureren (${v.teFactureren} stuks)` : 'Factureren',
        kan: v.teFactureren > 0,
        reden: v.teFactureren > 0 ? undefined : 'Alles wat geleverd is, is al gefactureerd.',
      }
    }

    case 'gefactureerd':
      return { label: 'Project afsluiten', kan: true }

    case 'on_hold':
      return {
        label: `Project hervatten → ${faseLabel(p.statusVorige ?? 'concept')}`,
        kan: true,
      }

    case 'geannuleerd':
      return {
        label: `Project heropenen → ${faseLabel(p.statusVorige ?? 'concept')}`,
        kan: true,
      }
  }
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
