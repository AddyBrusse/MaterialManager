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
  status: 'te_bestellen' | 'aangevraagd' | 'buffer' | 'besteld' | 'ontvangen'
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
  const uiterlijk = p.status === 'te_bestellen' || p.status === 'aangevraagd' || p.status === 'buffer' ? bestelUiterlijk(p.nodig, p.levertijdDagen, margeDagen) : null
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
  status: 'te_bestellen' | 'aangevraagd' | 'buffer' | 'besteld' | 'ontvangen'
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
    /** 260042: het nummer op het label. Null bij een order van vóór 2026-10-07. */
    materiaalNummer: string | null
  } | null
  /** Bij wie we een prijs gaan vragen (tab Te bestellen). */
  leverancierIds: string[]
  /** Per gevraagde leverancier: welke aanvraag, wanneer, en het antwoord (tab Open prijsaanvragen). */
  gevraagd: {
    aanvraagId: string; leverancierId: string; naam: string; verzondenOp: string | null
    antwoord: { id: string; prijsSoort: 'per_kg' | 'per_stuk' | 'totaal'; prijs: number; zaagkostenPerSnede: number | null; levertijdDagen: number | null } | null
  }[]
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
  const nietInBuffer = regels.find((r) => r.status !== 'buffer')
  if (nietInBuffer) return `${nietInBuffer.materiaal} staat nog niet in de inkoopbuffer. Kies eerst een leverancier bij Open prijsaanvragen.`
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

// ── Tabbladen (2026-10-07): wat er per stap moet kunnen ──

type RegelKort = { materiaal: string; status: 'te_bestellen' | 'aangevraagd' | 'buffer' | 'besteld' | 'ontvangen' }

/** Prijzen aanvragen kan voor regels die nog te bestellen zijn en minstens één leverancier hebben. */
export function waaromNietPrijzenAanvragen(
  regels: (RegelKort & { leverancierIds: string[] })[],
  leveranciers: Pick<InkoopLeverancier, 'id' | 'naam' | 'email'>[],
): string | null {
  if (regels.length === 0) return 'Vink eerst één of meer regels aan.'
  const al = regels.find((r) => r.status !== 'te_bestellen')
  if (al) return `${al.materiaal} is al aangevraagd. Nog een leverancier erbij? Doe dat bij Open prijsaanvragen.`
  const zonder = regels.find((r) => r.leverancierIds.length === 0)
  if (zonder) return `Bij ${zonder.materiaal} staat nog geen leverancier. Kies er een met "Leveranciers toevoegen".`
  for (const id of new Set(regels.flatMap((r) => r.leverancierIds))) {
    const l = leveranciers.find((x) => x.id === id)
    if (!l) return 'Een van de gekozen leveranciers bestaat niet meer. Haal hem weg bij de regel.'
    if (!l.email) return `Bij ${l.naam} staat geen e-mailadres. Vul het in bij Relaties → ${l.naam} (of bij een contactpersoon).`
  }
  return null
}

/** Naar de buffer: alleen een aangevraagde regel met een gekozen leverancier. */
export function waaromNietNaarBuffer(r: RegelKort & { keuze: unknown | null }): string | null {
  if (r.status === 'buffer') return `${r.materiaal} staat al in de inkoopbuffer.`
  if (r.status === 'besteld' || r.status === 'ontvangen') return `${r.materiaal} is al besteld.`
  if (r.status === 'te_bestellen') return `Voor ${r.materiaal} is nog geen prijs gevraagd.`
  if (!r.keuze) return `Kies eerst een leverancier voor ${r.materiaal}.`
  return null
}

/** Terug uit de buffer kan tot de regel op een inkooporder staat. */
export function waaromNietUitBuffer(r: RegelKort & { inkooporder: { id: string } | null }): string | null {
  if (r.status !== 'buffer') return `${r.materiaal} staat niet in de inkoopbuffer.`
  if (r.inkooporder) return `${r.materiaal} staat al op ${r.inkooporder.id}. Gooi die eerst weg.`
  return null
}

/**
 * De nummers die de stukken in de voorraad krijgen (2026-10-07). Eén stuk op de
 * regel: het nummer zelf. Meer stuks: -1, -2 …, doorgeteld over deelleveringen,
 * zodat elk stuk één nummer heeft dat nooit twee keer voorkomt.
 */
export function stukNummers(materiaalNummer: string, stuksOpRegel: number, alOntvangen: number, nu: number): string[] {
  if (stuksOpRegel <= 1) return nu > 0 ? [materiaalNummer] : []
  return Array.from({ length: nu }, (_, i) => `${materiaalNummer}-${alOntvangen + i + 1}`)
}

/**
 * Wat iemand intypt naar het nummer zelf: geen spaties, en het stukvolgnummer
 * eraf (`260042-2` → `260042`). Een nummer uit de eerste versie (`M26-0042`)
 * wordt het nieuwe (`260042`); zo heette het tot 2026-10-07.
 */
export function normaliseerMateriaalNummer(invoer: string): string {
  const s = invoer.trim().toUpperCase().replace(/\s+/g, '')
  const nieuw = /^(\d{6,})(?:-\d+)?$/.exec(s)
  if (nieuw) return nieuw[1]
  const oud = /^M(\d{2})-(\d+)(?:-\d+)?$/.exec(s)
  if (oud) return `${oud[1]}${oud[2].padStart(4, '0')}`
  return s
}

/** Ziet dit eruit als een materiaalnummer (jaar + volgnummer, minstens 6 cijfers)? */
export const isMateriaalNummer = (s: string) => /^\d{6,}$/.test(s)

/**
 * Wacht deze productieorder op materiaal? Ja zolang er voor zijn orderregel een
 * bestelregel open staat (alles behalve "ontvangen"). Afgeleid, nooit opgeslagen.
 */
export function wachtOpMateriaal(
  order: { projectId: string; offerteRegelId: string },
  bestelRegels: { projectId: string | null; offerteRegelId: string | null; status: string }[],
): boolean {
  return bestelRegels.some((b) => b.status !== 'ontvangen' && b.projectId === order.projectId && b.offerteRegelId === order.offerteRegelId)
}
