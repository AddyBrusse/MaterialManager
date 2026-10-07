/**
 * Inkoopplanning (2026-10-07): wanneer is materiaal nodig voor de productie,
 * wanneer moet het uiterlijk besteld zijn, en loopt wat onderweg is op tijd.
 * Alles hier is afgeleid en wordt nooit opgeslagen — een opgeslagen "uiterlijk
 * bestellen" loopt achter zodra de planning schuift.
 *
 * Datums zijn 'YYYY-MM-DD'. Werkdagen zijn ma–vr; feestdagen telt het niet.
 */

export const INKOOP_STANDEN = ['te_laat_besteld', 'nu_bestellen', 'wacht', 'komt_te_laat', 'onderweg_op_tijd', 'binnen'] as const
export type InkoopStand = typeof INKOOP_STANDEN[number]

/** Wat vandaag iets van iemand vraagt; alleen dit telt het getal in het menu. */
export const STAND_VANDAAG: readonly InkoopStand[] = ['te_laat_besteld', 'nu_bestellen', 'komt_te_laat']

/** Hoeveel werkdagen vóór de leverdatum aan de klant de productie klaar moet zijn, als er niets gepland is. */
export const DAGEN_VOOR_LEVERING = 2

const ISO = /^\d{4}-\d{2}-\d{2}/

/** Alleen het datumdeel, of null als het geen datum is. */
export const alsDatum = (s: string | null | undefined): string | null => (s && ISO.test(s) ? s.slice(0, 10) : null)

const naarUtc = (d: string) => new Date(`${d}T00:00:00Z`)
const vanUtc = (d: Date) => d.toISOString().slice(0, 10)

/** De datum van vandaag in de tijdzone van de pc, niet in UTC. */
export function vandaagIso(nu: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${nu.getFullYear()}-${p(nu.getMonth() + 1)}-${p(nu.getDate())}`
}

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6

/** `n` werkdagen verder (of terug bij een negatief getal). Vanaf een weekenddag telt maandag als eerste. */
export function plusWerkdagen(datum: string, n: number): string {
  const d = naarUtc(datum)
  const stap = n < 0 ? -1 : 1
  let over = Math.abs(Math.round(n))
  while (over > 0) {
    d.setUTCDate(d.getUTCDate() + stap)
    if (!isWeekend(d)) over--
  }
  return vanUtc(d)
}

/** Kalenderdagen van `a` naar `b` (positief als b later is). */
export const dagenTussen = (a: string, b: string) => Math.round((+naarUtc(b) - +naarUtc(a)) / 86_400_000)

/** "09-10" */
export const kortDatum = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}`

export interface StapVoorPlanning {
  geplandDatum?: string | null
  gereedOp?: string | null
  machine?: string | null
  geplandMachine?: string | null
}

export interface NodigVoor {
  datum: string | null
  /** 'productie' = een geplande productiestap, 'levering' = levertijd van het project min de marge. */
  bron: 'productie' | 'levering' | null
  machine: string | null
}

/**
 * Wanneer het materiaal er moet zijn: de vroegst geplande productiestap die
 * nog niet gereed is. Is er niets gepland, dan de levertijd aan de klant min
 * `DAGEN_VOOR_LEVERING` werkdagen.
 */
export function nodigVoorProductie(stappen: StapVoorPlanning[], levertijdDatum: string | null): NodigVoor {
  const gepland = stappen
    .filter((s) => !s.gereedOp && alsDatum(s.geplandDatum))
    .sort((a, b) => (alsDatum(a.geplandDatum)! < alsDatum(b.geplandDatum)! ? -1 : 1))[0]
  if (gepland) return { datum: alsDatum(gepland.geplandDatum), bron: 'productie', machine: gepland.geplandMachine || gepland.machine || null }
  const lever = alsDatum(levertijdDatum)
  if (lever) return { datum: plusWerkdagen(lever, -DAGEN_VOOR_LEVERING), bron: 'levering', machine: null }
  return { datum: null, bron: null, machine: null }
}

/** Uiterlijk bestellen: nodig − levertijd − marge, in werkdagen. Onbekende levertijd telt als 0. */
export function bestelUiterlijk(nodig: string | null, levertijdDagen: number | null, margeDagen: number): string | null {
  return nodig ? plusWerkdagen(nodig, -((levertijdDagen ?? 0) + margeDagen)) : null
}

/** Verwacht binnen: een aangepaste datum gaat voor besteld + levertijd. */
export function verwachtBinnen(besteldOp: string | null, levertijdDagen: number | null, aangepast: string | null): string | null {
  const a = alsDatum(aangepast)
  if (a) return a
  const b = alsDatum(besteldOp)
  return b && levertijdDagen != null ? plusWerkdagen(b, levertijdDagen) : null
}

export interface PlanInvoer {
  status: 'te_bestellen' | 'aangevraagd' | 'besteld' | 'ontvangen'
  nodig: string | null
  /** Van de gekozen of voorgestelde leverancier. */
  levertijdDagen: number | null
  /** Alleen als hij besteld is. */
  verwacht: string | null
}

export interface Plan {
  stand: InkoopStand
  uiterlijk: string | null
  verwacht: string | null
  /** Bij "komt te laat": zoveel kalenderdagen na nodig. */
  dagenTeLaat: number | null
  tekst: string
}

const dagen = (n: number) => `${n} ${n === 1 ? 'dag' : 'dagen'}`

/** De stand van één regel, op `vandaag`. */
export function planVoor(p: PlanInvoer, vandaag: string, margeDagen: number): Plan {
  const uiterlijk = p.status === 'te_bestellen' || p.status === 'aangevraagd' ? bestelUiterlijk(p.nodig, p.levertijdDagen, margeDagen) : null
  if (p.status === 'ontvangen') return { stand: 'binnen', uiterlijk: null, verwacht: p.verwacht, dagenTeLaat: null, tekst: 'binnen' }
  if (p.status === 'besteld') {
    if (p.verwacht && p.nodig && p.verwacht > p.nodig) {
      const n = dagenTussen(p.nodig, p.verwacht)
      return { stand: 'komt_te_laat', uiterlijk: null, verwacht: p.verwacht, dagenTeLaat: n, tekst: `komt ${dagen(n)} te laat` }
    }
    return {
      stand: 'onderweg_op_tijd', uiterlijk: null, verwacht: p.verwacht, dagenTeLaat: null,
      tekst: p.verwacht ? `onderweg · verwacht ${kortDatum(p.verwacht)}` : 'onderweg · leverdatum onbekend',
    }
  }
  if (uiterlijk && uiterlijk < vandaag) {
    return { stand: 'te_laat_besteld', uiterlijk, verwacht: null, dagenTeLaat: null, tekst: `te laat · had ${kortDatum(uiterlijk)} besteld moeten zijn` }
  }
  if (uiterlijk && uiterlijk === vandaag) return { stand: 'nu_bestellen', uiterlijk, verwacht: null, dagenTeLaat: null, tekst: 'uiterlijk bestellen vandaag' }
  return {
    stand: 'wacht', uiterlijk, verwacht: null, dagenTeLaat: null,
    tekst: uiterlijk ? `wacht · uiterlijk bestellen ${kortDatum(uiterlijk)}` : 'wacht · nog geen datum nodig',
  }
}

export const vraagtVandaag = (s: InkoopStand) => STAND_VANDAAG.includes(s)

export interface GroepRegel { totaal: number | null; plan: Pick<Plan, 'stand' | 'uiterlijk'> }

export interface Groep {
  totaal: number
  francoBedrag: number | null
  /** Wat er nog bij moet voor gratis verzending; 0 als het gehaald is, null zonder grens. */
  nogTotFranco: number | null
  /** De vroegste "uiterlijk bestellen" in de groep. */
  uiterlijk: string | null
  /** Moet de groep vandaag de deur uit? */
  vandaag: boolean
  /** Regels zonder prijs tellen niet mee in het totaal. */
  zonderPrijs: number
}

/** Een leverancier met zijn open regels: totaal tegen de franco-grens en de vroegste datum. */
export function groepVoor(regels: GroepRegel[], francoBedrag: number | null): Groep {
  const totaal = Math.round(regels.reduce((t, r) => t + (r.totaal ?? 0), 0) * 100) / 100
  const datums = regels.map((r) => r.plan.uiterlijk).filter((d): d is string => !!d).sort()
  return {
    totaal, francoBedrag,
    nogTotFranco: francoBedrag == null || francoBedrag <= 0 ? null : Math.max(0, Math.round((francoBedrag - totaal) * 100) / 100),
    uiterlijk: datums[0] ?? null,
    vandaag: regels.some((r) => vraagtVandaag(r.plan.stand)),
    zonderPrijs: regels.filter((r) => r.totaal == null).length,
  }
}

export interface MeldingRegel {
  id: string
  materiaal: string
  projectId: string | null
  leverancierNaam: string | null
  inkooporderId: string | null
  nodig: NodigVoor
  plan: Plan
}

export interface InkoopMelding { regelId: string; stand: InkoopStand; titel: string; tekst: string }

/** De zinnen bij het belletje. Alleen wat vandaag iets vraagt. */
export function meldingVoor(r: MeldingRegel): InkoopMelding | null {
  const voor = r.projectId ? ` voor ${r.projectId}` : ''
  const waarvoor = r.nodig.datum
    ? `${r.nodig.bron === 'productie' ? (r.nodig.machine ?? 'de productie') : 'de levering'} op ${kortDatum(r.nodig.datum)}`
    : 'de productie'
  const p = r.plan
  if (p.stand === 'te_laat_besteld') {
    return { regelId: r.id, stand: p.stand, titel: `Te laat besteld: ${r.materiaal}${voor}`, tekst: `Had ${kortDatum(p.uiterlijk!)} besteld moeten zijn voor ${waarvoor}. Bestel vandaag, of schuif de planning.` }
  }
  if (p.stand === 'nu_bestellen') {
    return { regelId: r.id, stand: p.stand, titel: `Vandaag bestellen: ${r.materiaal}${voor}`, tekst: `Anders is het er niet op tijd voor ${waarvoor}${r.leverancierNaam ? ` (${r.leverancierNaam})` : ''}.` }
  }
  if (p.stand === 'komt_te_laat') {
    return { regelId: r.id, stand: p.stand, titel: `Komt te laat: ${r.materiaal}${voor}`, tekst: `${r.inkooporderId ?? 'De order'} verwacht ${kortDatum(p.verwacht!)}, nodig voor ${waarvoor}.${r.leverancierNaam ? ` Bel ${r.leverancierNaam}.` : ''}` }
  }
  return null
}

// ── Het overzicht op de Bestellingen-pagina: één antwoord van de server ──

/** Een leverancier die je voor de regel kunt kiezen, met wat hij kost. */
export interface InkoopOptie {
  leverancierId: string
  naam: string
  /** 'prijs' = er is een prijs; 'gevraagd' = aangevraagd, nog geen antwoord. */
  soort: 'prijs' | 'gevraagd'
  bron: 'prijslijst' | 'antwoord' | null
  antwoordId: string | null
  aanvraagId: string | null
  totaal: number | null
  uitleg: string | null
  levertijdDagen: number | null
  goedkoopst: boolean
}

export interface InkoopOverzichtRegel {
  id: string
  status: 'te_bestellen' | 'aangevraagd' | 'besteld' | 'ontvangen'
  bron: string
  materiaal: string
  exoot: boolean
  stuks: number
  lengteMm: number
  kg: number
  projectId: string | null
  klantNaam: string | null
  artikelNaam: string | null
  notitie: string | null
  levertijdDatum: string | null
  nodig: NodigVoor
  plan: Plan
  /** De gekozen leverancier, of anders de goedkoopste — die wordt het bij Bestellen. */
  leverancier: (InkoopOptie & { gekozen: boolean }) | null
  opties: InkoopOptie[]
  /** Op een inkooporder (concept = klaargezet, nog niet bevestigd als verstuurd). */
  order: {
    id: string; status: 'concept' | 'verzonden'; inkooporderRegelId: string; referentie: string
    verzondenOp: string | null; verwachtAangepast: boolean; ontvangenStuks: number; leverancierNaam: string
  } | null
  /** Laatste keer iets binnen, voor "Binnen, afgelopen 14 dagen". */
  binnenOp: string | null
  gereserveerd: boolean
}

export interface InkoopLeverancier { id: string; naam: string; email: string | null; francoBedrag: number | null }

export interface InkoopOverzicht {
  vandaag: string
  margeDagen: number
  regels: InkoopOverzichtRegel[]
  leveranciers: InkoopLeverancier[]
  meldingen: InkoopMelding[]
}

type RegelVoorBestellen = Pick<InkoopOverzichtRegel, 'materiaal' | 'status' | 'order' | 'leverancier'>

/** Waarom deze regels niet besteld kunnen worden, of `null`. */
export function waaromNietBestellen(regels: RegelVoorBestellen[], leveranciers: Pick<InkoopLeverancier, 'id' | 'naam' | 'email'>[]): string | null {
  if (regels.length === 0) return 'Kies eerst één of meer regels om te bestellen.'
  const op = regels.find((r) => r.order)
  if (op) {
    return op.order!.status === 'concept'
      ? `${op.materiaal} staat al klaar op ${op.order!.id}. Bevestig daar dat hij verstuurd is, of gooi hem weg.`
      : `${op.materiaal} is al besteld op ${op.order!.id}.`
  }
  const klaar = regels.find((r) => r.status === 'besteld' || r.status === 'ontvangen')
  if (klaar) return `${klaar.materiaal} is al besteld.`
  const zonder = regels.find((r) => !r.leverancier || r.leverancier.soort !== 'prijs')
  if (zonder) return `Voor ${zonder.materiaal} is nog geen prijs. Vraag een prijs of vul het antwoord in; dan kan hij mee.`
  for (const r of regels) {
    const l = leveranciers.find((x) => x.id === r.leverancier!.leverancierId)
    if (!l?.email) {
      const naam = l?.naam ?? r.leverancier!.naam
      return `Bij ${naam} staat geen e-mailadres. Vul het in bij Relaties → ${naam} (of bij een contactpersoon).`
    }
  }
  return null
}
