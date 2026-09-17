// Waar staat een project, per orderregel en in totaal.
//
// Dit is het enige bestand dat bepaalt wat "gemaakt", "geleverd" en
// "gefactureerd" betekenen. Schermen rekenen dat niet zelf uit — dezelfde
// reden als bij de voorraad (fysiek/gereserveerd/vrij) en bij
// `effectieveSeconden`: zodra twee plekken hun eigen sommetje maken, gaan ze
// uit elkaar lopen en is niet meer te zeggen welke van de twee liegt.
//
// De vier toestanden zijn een OPDELING van het bestelde aantal, geen geneste
// schalen:
//
//     [afgehandeld][geleverd, nog niet gefactureerd][klaar op de vloer][nog te maken]
//
// Ze tellen altijd op tot `besteld`. Dat leest van links naar rechts als de
// weg die het werk aflegt, en de grijze staart is altijd precies "wat er nog
// moet".
//
// Een gecrediteerd stuk is éérst gefactureerd — je crediteert een factuur, geen
// levering — dus `gecrediteerd` is altijd een deelverzameling van
// `gefactureerd`. Ze bij elkaar optellen telt hetzelfde stuk twee keer, en dan
// loopt de balk over de rand. `afgehandeld` is daarom gewoon `gefactureerd`;
// dat de klant het geld terugkreeg staat in het bedrag en in de zin bij de
// regel, niet nog een keer in de aantallen.
import type { Project, OfferteRegel, ProductieOrder, Paklijst, Factuur } from '../schemas/project'

export type RegelVoortgang = {
  offerteRegelId: string
  naam: string
  eenheid: string
  verkoopprijs: number
  besteld: number
  gemaakt: number
  geleverd: number
  gefactureerd: number
  gecrediteerd: number
  /** Gemaakt maar nog niet geleverd — ligt in de hal. */
  klaar: number
  /** Besteld maar nog niet gemaakt. */
  teMaken: number
  /** Geleverd en nog niet gefactureerd — hier staat nog geld tegenover. */
  teFactureren: number
  /** In geld: `teFactureren` maal de stukprijs van de offerteregel. */
  teFacturerenBedrag: number
  /** Per pakbon wat die bon van deze regel droeg, in de volgorde van de bonnen. */
  leveringen: { paklijstId: string; qty: number }[]
}

export type ProjectVoortgang = {
  regels: RegelVoortgang[]
  besteld: number
  gemaakt: number
  geleverd: number
  gefactureerd: number
  gecrediteerd: number
  klaar: number
  teMaken: number
  teFactureren: number
  teFacturerenBedrag: number
  /** Aantal pakbonnen dat er al ligt — bepaalt of de volgende de 2e of 3e is. */
  aantalPakbonnen: number
}

/** De regels waar het project op gebaseerd is: de opdrachtbevestiging als die
 *  er is, anders de geaccepteerde offerte, anders de laatste offerteversie.
 *  Een vervallen versie telt nooit mee — daar is niets van besteld. */
export function basisRegels(project: Project): OfferteRegel[] {
  if (project.opdrachtbevestiging) return project.opdrachtbevestiging.regels
  const geaccepteerd = project.offertes.find(o => o.status === 'geaccepteerd')
  if (geaccepteerd) return geaccepteerd.regels
  const levend = project.offertes.filter(o => o.status !== 'vervallen')
  const laatste = levend[levend.length - 1] ?? project.offertes[project.offertes.length - 1]
  return laatste ? laatste.regels : []
}

/** Waar een paklijstregel bij hoort. Het vastgelegde veld gaat voor; alleen
 *  voor pakbonnen van vóór die kolom vallen we terug op de productieorder. */
function regelVanLevering(
  r: { offerteRegelId: string | null; productieOrderId: string },
  orders: ProductieOrder[],
): string | null {
  if (r.offerteRegelId) return r.offerteRegelId
  return orders.find(o => o.id === r.productieOrderId)?.offerteRegelId ?? null
}

export function berekenVoortgang(project: Project): ProjectVoortgang {
  const regels = basisRegels(project)
  const orders = project.productieOrders
  const paklijsten: Paklijst[] = project.paklijsten
  const facturen: Factuur[] = project.facturen

  // Gemaakt per orderregel. Meerdere productieorders kunnen naar dezelfde
  // offerteregel wijzen (een order die in twee batches gesplitst is), dus
  // optellen en niet overschrijven.
  const gemaakt = new Map<string, number>()
  for (const o of orders) {
    // Een order die gereed is maar waarvan niemand een aantal invulde, telt
    // voor zijn volle hoeveelheid — anders zouden alle orders van vóór deze
    // kolom ineens op nul staan.
    const n = o.aantalGereed > 0 ? o.aantalGereed : o.status === 'gereed' ? o.qty : 0
    gemaakt.set(o.offerteRegelId, (gemaakt.get(o.offerteRegelId) ?? 0) + n)
  }

  const geleverd = new Map<string, number>()
  const perPakbon = new Map<string, { paklijstId: string; qty: number }[]>()
  for (const pl of paklijsten) {
    for (const r of pl.regels) {
      const id = regelVanLevering(r, orders)
      if (!id) continue
      geleverd.set(id, (geleverd.get(id) ?? 0) + r.qty)
      const lijst = perPakbon.get(id) ?? []
      lijst.push({ paklijstId: pl.id, qty: r.qty })
      perPakbon.set(id, lijst)
    }
  }

  const gefactureerd = new Map<string, number>()
  const gecrediteerd = new Map<string, number>()
  for (const f of facturen) {
    const doel = f.soort === 'credit' ? gecrediteerd : gefactureerd
    for (const r of f.regels) {
      doel.set(r.offerteRegelId, (doel.get(r.offerteRegelId) ?? 0) + r.qty)
    }
  }

  const uit: RegelVoortgang[] = regels.map(r => {
    const besteld = r.qty
    // Begrenzen op wat besteld is: één handmatig te hoog ingevuld aantal mag
    // de balk niet over de rand duwen en de optelling niet laten kloppen.
    const g = Math.min(gemaakt.get(r.id) ?? 0, besteld)
    const lev = Math.min(geleverd.get(r.id) ?? 0, besteld)
    const fact = Math.min(gefactureerd.get(r.id) ?? 0, besteld)
    // Nooit meer gecrediteerd dan gefactureerd: crediteren doe je op een
    // factuur, dus verder kan het niet gaan.
    const cred = Math.min(gecrediteerd.get(r.id) ?? 0, fact)
    const teFactureren = Math.max(0, lev - fact)
    return {
      offerteRegelId: r.id,
      naam: r.naam,
      eenheid: r.eenheid,
      verkoopprijs: r.verkoopprijs,
      besteld,
      // Geleverd kan niet minder gemaakt zijn dan geleverd: wat de deur uit
      // ging, is gemaakt, ook als niemand het aantal invulde.
      gemaakt: Math.max(g, lev),
      geleverd: lev,
      gefactureerd: fact,
      gecrediteerd: cred,
      klaar: Math.max(0, Math.max(g, lev) - lev),
      teMaken: Math.max(0, besteld - Math.max(g, lev)),
      teFactureren,
      teFacturerenBedrag: teFactureren * r.verkoopprijs,
      leveringen: perPakbon.get(r.id) ?? [],
    }
  })

  const som = (f: (r: RegelVoortgang) => number) => uit.reduce((t, r) => t + f(r), 0)
  return {
    regels: uit,
    besteld: som(r => r.besteld),
    gemaakt: som(r => r.gemaakt),
    geleverd: som(r => r.geleverd),
    gefactureerd: som(r => r.gefactureerd),
    gecrediteerd: som(r => r.gecrediteerd),
    klaar: som(r => r.klaar),
    teMaken: som(r => r.teMaken),
    teFactureren: som(r => r.teFactureren),
    teFacturerenBedrag: som(r => r.teFacturerenBedrag),
    aantalPakbonnen: paklijsten.length,
  }
}

// ── De vier segmenten van de balk ────────────────────────────────────────────

export type BalkSegment = { soort: 'afgehandeld' | 'teFactureren' | 'klaar' | 'teMaken'; aantal: number }

/** Telt gegarandeerd op tot `besteld`. Nul-segmenten blijven staan zodat een
 *  balk altijd dezelfde vier delen in dezelfde volgorde heeft. */
export function balkSegmenten(v: Pick<RegelVoortgang,
  'besteld' | 'gefactureerd' | 'geleverd' | 'gemaakt'>): BalkSegment[] {
  // Niet `gefactureerd + gecrediteerd`: een gecrediteerd stuk zit al in
  // gefactureerd, en opgeteld loopt de balk over het bestelde aantal heen.
  const afgehandeld = v.gefactureerd
  return [
    { soort: 'afgehandeld', aantal: afgehandeld },
    { soort: 'teFactureren', aantal: Math.max(0, v.geleverd - afgehandeld) },
    { soort: 'klaar', aantal: Math.max(0, v.gemaakt - v.geleverd) },
    { soort: 'teMaken', aantal: Math.max(0, v.besteld - v.gemaakt) },
  ]
}

// ── Welke stap is nu aan de beurt ────────────────────────────────────────────

export type StapNaam = 'offerte' | 'productie' | 'levering' | 'factuur'
export type StapStand = 'klaar' | 'nu' | 'rust' | 'uit'

/** Per kolomgroep de toestand van zijn knop. Er is altijd precies één 'nu',
 *  zodat er op het scherm nooit twee even harde knoppen naast elkaar staan en
 *  je niet hoeft te kiezen waar je begint. */
export function stapStanden(project: Project, v: ProjectVoortgang): Record<StapNaam, StapStand> {
  const heeftOpdracht = project.opdrachtbevestiging !== null
  const geaccepteerd = project.offertes.some(o => o.status === 'geaccepteerd')
  const offerteKlaar = heeftOpdracht || geaccepteerd

  const standen: Record<StapNaam, StapStand> = {
    offerte: offerteKlaar ? 'klaar' : 'nu',
    productie: !offerteKlaar ? 'uit' : v.teMaken > 0 ? 'rust' : 'klaar',
    levering: !offerteKlaar ? 'uit' : v.klaar > 0 ? 'rust' : v.geleverd > 0 ? 'klaar' : 'uit',
    factuur: !offerteKlaar ? 'uit' : v.teFactureren > 0 ? 'rust' : v.gefactureerd > 0 ? 'klaar' : 'uit',
  }

  // Precies één blauwe. De volgorde is die van het geld: eerst wat klaarligt
  // de deur uit, dan factureren, dan pas nieuw werk inplannen. Wachten op de
  // klant telt niet als jouw beurt.
  if (!offerteKlaar) {
    standen.offerte = 'nu'
  } else if (v.klaar > 0) {
    standen.levering = 'nu'
  } else if (v.teFactureren > 0) {
    standen.factuur = 'nu'
  } else if (v.teMaken > 0) {
    standen.productie = 'nu'
  }
  return standen
}

// ── Wat er nu "de" pakbon of "de" factuur is ─────────────────────────────────
//
// Lijsten en overzichten tonen er één per project. Nu er meer kunnen zijn is
// dat de laatste; deze twee zorgen dat elk scherm dezelfde kiest.

export function laatstePaklijst(project: Project): Paklijst | null {
  return project.paklijsten[project.paklijsten.length - 1] ?? null
}

/** De laatste échte factuur — een creditnota is geen factuur om te tonen. */
export function laatsteFactuur(project: Project): Factuur | null {
  const echte = project.facturen.filter(f => f.soort !== 'credit')
  return echte[echte.length - 1] ?? null
}

/** Wat er in totaal gefactureerd is, credits eraf. Dit is het bedrag dat de
 *  klant werkelijk moet betalen; de losse facturen zeggen dat niet meer zodra
 *  er ook maar één credit tussen staat. */
export function gefactureerdInclBtw(project: Project): number {
  const bedrag = project.facturen.reduce(
    (t, f) => t + (f.soort === 'credit' ? -f.totaalInclBtw : f.totaalInclBtw),
    0,
  )
  return Math.round(bedrag * 100) / 100
}
