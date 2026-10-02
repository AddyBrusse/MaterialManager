import type { PaklijstRegel, ProductieOrder, Project, ProjectStatus } from '../schemas/project'
import { basisRegels, berekenVoortgang } from './projectvoortgang'

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
 * Wat er per regel nog voor een pakbon beschikbaar is: gemaakt min wat al op
 * een pakbon staat. Met `zonder` telt die pakbon niet mee — bij het aanpassen
 * van een concept zijn zijn eigen stuks immers weer beschikbaar.
 */
export function leverVoortgang(p: Project, zonder?: string) {
  return berekenVoortgang(zonder ? { ...p, paklijsten: p.paklijsten.filter(pl => pl.id !== zonder) } : p)
}

/**
 * De regels voor een nieuwe pakbon (besloten 2026-10-02): alleen regels die
 * helemaal klaar zijn — alles wat nog geleverd moet worden is gereed. Een regel
 * die maar deels klaar is, voeg je zelf toe; anders gaat er ongemerkt een halve
 * regel de deur uit.
 */
export function voorstelPakbon(p: Project): PakbonRegelKeuze[] {
  return berekenVoortgang(p).regels
    .filter(r => r.klaar > 0 && r.teMaken === 0)
    .map(r => ({ offerteRegelId: r.offerteRegelId, qty: r.klaar }))
}

/**
 * Waarom deze pakbon niet kan, of `null`.
 *
 * Meer meegeven dan er klaarligt kan niet (besloten 2026-10-02): wat de deur
 * uit gaat moet eerst gereed gemeld zijn, anders klopt "gemaakt" niet meer en
 * rekent de nacalculatie met stuks die niemand heeft afgemeld.
 *
 * Een concept mag leeg zijn (`leegMag`); je vult hem daarna op de tab. Bij het
 * aanpassen van een bestaand concept geef je zijn id mee als `pakbonId`.
 */
export function waaromNietPakbon(
  p: Project, regels: PakbonRegelKeuze[], opties: { pakbonId?: string; leegMag?: boolean } = {},
): string | null {
  const v = leverVoortgang(p, opties.pakbonId)
  if (regels.length === 0) {
    if (opties.leegMag) return null
    return v.klaar === 0
      ? 'Er ligt nog niets klaar om te leveren. Meld eerst stuks gereed op de Productie-tab.'
      : 'Zet minstens één regel op de pakbon.'
  }
  const gezien = new Set<string>()
  for (const g of regels) {
    const r = v.regels.find(x => x.offerteRegelId === g.offerteRegelId)
    if (!r) return 'Een van de regels bestaat niet (meer) in de opdracht. Ververs de pagina.'
    if (gezien.has(g.offerteRegelId)) return `${r.naam} staat twee keer op de pakbon.`
    gezien.add(g.offerteRegelId)
    if (!(g.qty > 0)) return `${r.naam}: vul een aantal groter dan 0 in, of haal de regel weg.`
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
 * Van keuze naar pakbonregels. De productieorder levert naam en eenheid;
 * meerdere orders kunnen naar dezelfde orderregel wijzen, de eerste volstaat,
 * want de pakbon legt de orderregel zelf vast.
 */
export function pakbonRegels(p: Project, keuze: PakbonRegelKeuze[]): PaklijstRegel[] {
  return keuze.map(g => {
    const order = p.productieOrders.find(o => o.offerteRegelId === g.offerteRegelId)
    const regel = basisRegels(p).find(r => r.id === g.offerteRegelId)
    return {
      productieOrderId: order?.id ?? '',
      offerteRegelId: g.offerteRegelId,
      artikelNaam: order?.artikelNaam ?? regel?.naam ?? g.offerteRegelId,
      qty: g.qty,
      eenheid: order?.eenheid ?? regel?.eenheid ?? 'st',
    }
  })
}

/** Waarom deze pakbon niet verstuurd kan worden, of `null`. */
export function waaromNietPakbonVersturen(p: Project, pakbonId: string): string | null {
  const pl = p.paklijsten.find(x => x.id === pakbonId)
  if (!pl) return 'Deze pakbon bestaat niet (meer). Ververs de pagina.'
  if (pl.verzondenOp) return `${pl.id} is al verstuurd.`
  if (pl.regels.length === 0) return `${pl.id} heeft nog geen regels. Voeg eerst toe wat er mee moet.`
  return null
}

/** Waarom deze pakbon niet aangepast of verwijderd kan worden, of `null`. */
export function waaromNietPakbonWijzigen(p: Project, pakbonId: string): string | null {
  const pl = p.paklijsten.find(x => x.id === pakbonId)
  if (!pl) return 'Deze pakbon bestaat niet (meer). Ververs de pagina.'
  if (pl.verzondenOp) return `${pl.id} is al verstuurd en ligt bij de klant; die verandert niet meer.`
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
