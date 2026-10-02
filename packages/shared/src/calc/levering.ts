import type { ProductieOrder, Project, ProjectStatus } from '../schemas/project'
import { berekenVoortgang } from './projectvoortgang'

/**
 * Leveren in delen (besloten 2026-10-02).
 *
 * Een pakbon draagt wat de klant nu meekrijgt: een deel van de regels, en van
 * een regel een deel van de stuks. De projectstatus volgt daarbij de
 * voortgang en niet het bestaan van een pakbon — eerder sprong het project op
 * "Paklijst" bij de eerste deellevering, terwijl de helft nog gemaakt moest
 * worden.
 *
 * Web en server gebruiken dezelfde functies: het scherm vraagt `waaromNiet…`
 * vóór de handeling, de server nog eens en antwoordt `409 VOORWAARDE`.
 */

/** De statussen die deze regel bepaalt; de rest (offerte, factuur, on hold) blijft. */
const LEVERFASE: ProjectStatus[] = ['bevestigd', 'productie', 'paklijst', 'verzonden']

/**
 * De status na een handeling in de productie- of leverfase.
 *
 * | productie  | er moet nog iets gemaakt worden, ook na een deellevering
 * | paklijst   | "Gereed voor levering": alles gemaakt, nog niet alles verstuurd
 * | verzonden  | "Geleverd": alles op een verstuurde pakbon
 *
 * Een bevestigd project zonder enig gemaakt stuk blijft bevestigd.
 */
export function statusNaLevering(p: Project): ProjectStatus {
  if (!LEVERFASE.includes(p.status)) return p.status
  const v = berekenVoortgang(p)
  if (v.besteld === 0) return p.status
  const allesVerstuurd = v.teMaken === 0 && v.klaar === 0 && p.paklijsten.every(pl => pl.verzondenOp)
  if (allesVerstuurd) return 'verzonden'
  if (v.teMaken === 0) return 'paklijst'
  if (p.status === 'bevestigd' && v.gemaakt === 0 && v.geleverd === 0) return 'bevestigd'
  return 'productie'
}

/** Hoeveel pakbonnen er al de deur uit zijn terwijl er nog gemaakt wordt. */
export function aantalDeelleveringen(p: Project): number {
  return p.paklijsten.filter(pl => pl.verzondenOp).length
}

export interface PakbonRegelKeuze {
  offerteRegelId: string
  qty: number
}

/**
 * Waarom deze pakbon niet kan, of `null`.
 *
 * Meer meegeven dan er klaarligt kan niet (besloten 2026-10-02): wat de deur
 * uit gaat moet eerst gereed gemeld zijn, anders klopt "gemaakt" niet meer en
 * rekent de nacalculatie met stuks die niemand heeft afgemeld.
 */
export function waaromNietPakbon(p: Project, regels: PakbonRegelKeuze[]): string | null {
  const v = berekenVoortgang(p)
  if (v.klaar === 0) {
    return 'Er ligt nog niets klaar om te leveren. Meld eerst stuks gereed op de Productie-tab.'
  }
  if (regels.length === 0) return 'Vink minstens één regel aan om op de pakbon te zetten.'
  for (const g of regels) {
    const r = v.regels.find(x => x.offerteRegelId === g.offerteRegelId)
    if (!r) return 'Een van de regels bestaat niet (meer) in de opdracht. Ververs de pagina.'
    if (!(g.qty > 0)) return `${r.naam}: vul een aantal groter dan 0 in, of vink de regel uit.`
    if (g.qty > r.klaar) {
      const tekort = g.qty - r.klaar
      if (r.klaar === 0) {
        return `${r.naam}: er ligt niets klaar. Meld eerst ${tekort} ${r.eenheid} gereed op de Productie-tab.`
      }
      return `${r.naam}: er liggen er maar ${r.klaar} klaar. Meld eerst ${tekort} ${r.eenheid} gereed op de Productie-tab.`
    }
  }
  return null
}

/**
 * Deels gereed melden op de terminal: het totaal dat nu klaar is.
 *
 * Alleen omhoog — wat gereed staat kan op de werkvloer niet terug; een
 * correctie gaat via kantoor. En niet het volle aantal: dan is de order af, en
 * dat is "Gereed" op de laatste stap (die rondt ook de klok af en boekt het
 * materiaal af).
 */
export function waaromNietDeelsGereed(o: ProductieOrder, aantal: number): string | null {
  if (!Number.isFinite(aantal) || aantal <= 0 || !Number.isInteger(aantal)) {
    return 'Vul een heel aantal stuks in.'
  }
  if (aantal >= o.qty) {
    return `Zijn ze alle ${o.qty} klaar? Gebruik dan "Gereed" op de laatste stap.`
  }
  if (aantal <= o.aantalGereed) {
    return `Er staan er al ${o.aantalGereed} gereed. Vul het totaal in dat nu klaar is; lager kan alleen via kantoor.`
  }
  if (o.status === 'gestopt') return 'Deze order is gestopt.'
  if (o.status === 'voorbereiding') return 'Deze order is nog niet vrijgegeven.'
  return null
}
