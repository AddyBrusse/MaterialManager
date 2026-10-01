/**
 * Nacalculatie: wat een order werkelijk kostte, naast wat ervoor gecalculeerd was.
 *
 * De indeling is met opzet dezelfde vier posten als `computeEstimateTotals`:
 * materiaal, instellen, draaien (cyclus) en uitbesteed. Zou hier een eigen
 * indeling staan, dan telt geschat nooit op tot werkelijk en is elk verschil
 * onverklaarbaar.
 *
 * Zuivere rekenkunde: geen fetch, geen Prisma. De API levert de gemeten uren en
 * het verbruikte materiaal aan; wat "werkelijk" betekent per registratie staat
 * in `effectieveSeconden` in schemas/tijdregistratie.
 */

import { machineRatePerHour, type ArticleEstimate, type EstimateCtx, type EstimateTotals } from './estimate'

export type NacalculatiePost = 'materiaal' | 'instellen' | 'draaien' | 'extern'

export interface NacalculatieRegel {
  post: NacalculatiePost
  label: string
  /** Uit de calculatie, bij dit aantal — dus per stuk × aantal. */
  gecalculeerd: number
  werkelijk: number
  /** Verschil in euro's en als deel van het gecalculeerde bedrag. */
  verschil: number
  verschilPct: number | null
  /** Toelichting die het scherm onder de post zet, bv. "DMG 2:00 u → 3:15 u". */
  toelichting: string
}

export interface GemetenUren {
  /** Alleen afgeronde registraties tellen mee; lopend werk is nog geen feit. */
  instellenSeconden: number
  draaienSeconden: number
  instellenKosten: number
  draaienKosten: number
  /** Uren die onbemand liepen — die kosten geen operator. */
  onbemandSeconden: number
  /** Aantal registraties, zodat het scherm "nog niet gemeten" kan onderscheiden. */
  aantalRegistraties: number
}

export interface NacalculatieInput {
  qty: number
  /** Per stuk, zoals computeEstimateTotals hem teruggeeft. */
  geschat: EstimateTotals
  gemeten: GemetenUren
  /**
   * Werkelijk materiaalverbruik in euro's over de hele order. Null als er nog
   * niets afgeboekt is — dan valt er over materiaal niets te zeggen en tonen we
   * het gecalculeerde bedrag ongewijzigd in plaats van een nul te suggereren.
   */
  materiaalWerkelijk: number | null
  externWerkelijk: number | null
  /** Wat de klant betaalt over de hele order; vastgelegd bij de offerte. */
  verkoopTotaal: number | null
}

export interface Nacalculatie {
  qty: number
  regels: NacalculatieRegel[]
  gecalculeerdTotaal: number
  werkelijkTotaal: number
  verschilTotaal: number
  verschilPct: number | null
  verkoopTotaal: number | null
  margeGecalculeerdPct: number | null
  margeWerkelijkPct: number | null
  margeWerkelijkEuro: number | null
  /** Zonder afgeronde registraties is dit een voorspelling, geen nacalculatie. */
  gemeten: boolean
  onbemandSeconden: number
}

function pct(verschil: number, basis: number): number | null {
  if (basis === 0) return null
  return (verschil / basis) * 100
}

function urenTekst(seconden: number): string {
  const min = Math.round(seconden / 60)
  const u = Math.floor(min / 60)
  const m = min % 60
  return u > 0 ? `${u}:${String(m).padStart(2, '0')} u` : `${m} min`
}

function minutenTekst(minuten: number): string {
  return urenTekst(minuten * 60)
}

export function bouwNacalculatie(input: NacalculatieInput): Nacalculatie {
  const { qty, geschat, gemeten } = input
  const n = Math.max(1, qty)

  // computeEstimateTotals rekent per stuk; de nacalculatie gaat over de hele
  // order, dus alles maal het aantal.
  const materiaalGecalc = geschat.materialTotal * n
  const instellenGecalc = geschat.setupTotal * n
  const draaienGecalc   = geschat.cycleTotal * n
  const externGecalc    = geschat.externalTotal * n

  // Zonder meting is "werkelijk" niet nul maar onbekend. Het gecalculeerde
  // bedrag overnemen laat het verschil op nul staan, wat eerlijker is dan een
  // besparing tonen die alleen bestaat omdat er niets geregistreerd is.
  const materiaalWerk = input.materiaalWerkelijk ?? materiaalGecalc
  const externWerk    = input.externWerkelijk ?? externGecalc
  const instellenWerk = gemeten.aantalRegistraties > 0 ? gemeten.instellenKosten : instellenGecalc
  const draaienWerk   = gemeten.aantalRegistraties > 0 ? gemeten.draaienKosten   : draaienGecalc

  // Setup telt één keer per batch, cyclus per stuk — beide komen exact uit de
  // calculatiekern, niet uit een verdeling achteraf.
  const setupMinGecalc = geschat.setupMin
  const cycleMinGecalc = geschat.cycleMinPerPiece * n

  const regels: NacalculatieRegel[] = [
    regel('materiaal', 'Materiaal', materiaalGecalc, materiaalWerk,
      input.materiaalWerkelijk === null ? 'nog niet afgeboekt' : 'afgeboekt bij de zaagbon'),
    regel('instellen', 'Instellen', instellenGecalc, instellenWerk,
      gemeten.aantalRegistraties > 0
        ? `${minutenTekst(setupMinGecalc)} → ${urenTekst(gemeten.instellenSeconden)}`
        : 'nog niet gemeten'),
    regel('draaien', 'Draaien', draaienGecalc, draaienWerk,
      gemeten.aantalRegistraties > 0
        ? `${minutenTekst(cycleMinGecalc)} → ${urenTekst(gemeten.draaienSeconden)}`
        : 'nog niet gemeten'),
    regel('extern', 'Uitbesteed', externGecalc, externWerk,
      input.externWerkelijk === null ? 'geen afwijking geregistreerd' : 'werkelijke factuur'),
  ]

  const gecalculeerdTotaal = regels.reduce((s, r) => s + r.gecalculeerd, 0)
  const werkelijkTotaal    = regels.reduce((s, r) => s + r.werkelijk, 0)
  const verschilTotaal     = werkelijkTotaal - gecalculeerdTotaal

  const verkoop = input.verkoopTotaal
  return {
    qty,
    regels,
    gecalculeerdTotaal,
    werkelijkTotaal,
    verschilTotaal,
    verschilPct: pct(verschilTotaal, gecalculeerdTotaal),
    verkoopTotaal: verkoop,
    margeGecalculeerdPct: verkoop && verkoop > 0 ? ((verkoop - gecalculeerdTotaal) / verkoop) * 100 : null,
    margeWerkelijkPct:    verkoop && verkoop > 0 ? ((verkoop - werkelijkTotaal) / verkoop) * 100 : null,
    margeWerkelijkEuro:   verkoop != null ? verkoop - werkelijkTotaal : null,
    gemeten: gemeten.aantalRegistraties > 0,
    onbemandSeconden: gemeten.onbemandSeconden,
  }
}

function regel(
  post: NacalculatiePost, label: string, gecalculeerd: number, werkelijk: number, toelichting: string,
): NacalculatieRegel {
  const verschil = werkelijk - gecalculeerd
  return { post, label, gecalculeerd, werkelijk, verschil, verschilPct: pct(verschil, gecalculeerd), toelichting }
}

/**
 * Geadviseerde insteltijd uit de metingen: het gemiddelde van de afgeronde
 * instelregistraties, afgerond op vijf minuten. Onder de drie metingen geven we
 * geen advies — twee toevallige uitschieters mogen geen norm worden.
 */
export function adviesInstelMinuten(secondenPerMeting: number[]): number | null {
  if (secondenPerMeting.length < 3) return null
  const gem = secondenPerMeting.reduce((s, v) => s + v, 0) / secondenPerMeting.length
  return Math.max(5, Math.round(gem / 60 / 5) * 5)
}

/**
 * Idem voor cyclustijd per stuk: totaal gedraaide seconden gedeeld door het
 * aantal gemaakte stuks, afgerond op een halve minuut.
 */
export function adviesCycleMinuten(draaienSeconden: number, stuks: number): number | null {
  if (stuks <= 0 || draaienSeconden <= 0) return null
  const minPerStuk = draaienSeconden / 60 / stuks
  return Math.round(minPerStuk * 2) / 2
}

// ── Oordeel over een afwijking ──────────────────────────────────────────────

/**
 * Goedkoper dan gecalculeerd of duurder (besloten 2026-10-01).
 *
 * Twee kanten, geen tussenstand: goedkoper gemaakt dan berekend is groen,
 * anders rood. Eerder gaf de tabel 5–15 % oranje in béide richtingen en kleurde
 * het tabje een grote meevaller rood — drie schermen, drie oordelen over
 * hetzelfde getal. Onder een halve procent heet het "gelijk": dat is afronding,
 * geen signaal.
 */
export type AfwijkingRichting = 'goedkoper' | 'duurder' | 'gelijk'

export function afwijkingRichting(pct: number | null | undefined): AfwijkingRichting | null {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null
  if (Math.abs(pct) < 0.5) return 'gelijk'
  return pct < 0 ? 'goedkoper' : 'duurder'
}

// ── Per machine ─────────────────────────────────────────────────────────────

/** Machinenamen vergelijken zonder op hoofdletters of spaties te struikelen. */
export function machineSleutel(naam: string): string {
  return naam.trim().toLowerCase()
}

/** Wat de calculatie voor één machine rekent, over de hele order. */
export interface GecalculeerdeMachine {
  sleutel: string
  naam: string
  instelMin: number
  /** Cyclustijd × aantal. */
  draaienMin: number
  instelKosten: number
  draaienKosten: number
}

/**
 * De machinebewerkingen uit de calculatie, per machine opgeteld.
 *
 * Rekent precies zoals `computeEstimateTotals` (tarief uit `machineRatePerHour`,
 * insteltijd één keer, cyclus maal het aantal), zodat de machines samen optellen
 * tot de posten Instellen en Draaien van de order. `naamVan` geeft de naam uit de
 * machinelijst; zonder herleidbare machine blijft de naam van de calculatieknoop.
 */
export function gecalculeerdPerMachine(
  est: ArticleEstimate,
  ctx: EstimateCtx,
  qty: number,
  naamVan: (machineId: string | null | undefined) => string | null,
): GecalculeerdeMachine[] {
  const n = Math.max(1, qty)
  const uit = new Map<string, GecalculeerdeMachine>()
  for (const node of est.nodes) {
    if (node.type !== 'machine') continue
    const naam = naamVan(node.machineId) ?? node.name
    const sleutel = machineSleutel(naam)
    const rate = machineRatePerHour(node, ctx)
    const instelMin = node.setupMin || 0
    const draaienMin = (node.steps ?? []).reduce((s, st) => s + (st.cycleMin || 0), 0) * n
    const m = uit.get(sleutel) ?? {
      sleutel, naam, instelMin: 0, draaienMin: 0, instelKosten: 0, draaienKosten: 0,
    }
    m.instelMin += instelMin
    m.draaienMin += draaienMin
    m.instelKosten += (instelMin / 60) * rate
    m.draaienKosten += (draaienMin / 60) * rate
    uit.set(sleutel, m)
  }
  return [...uit.values()]
}

/** Eén keer klokken, zoals de nacalculatie hem toont. */
export interface Klokregel {
  id: string
  soort: 'instellen' | 'draaien'
  bemand: boolean
  status: 'lopend' | 'gepauzeerd' | 'afgerond'
  machineNaam: string | null
  userNaam: string | null
  gestartOp: string
  gestoptOp: string | null
  /** Effectief: de correctie als die er is (zie `effectieveSeconden`). */
  seconden: number
  /** Wat de klok zelf zag — blijft staan naast een correctie. */
  gemetenSeconden: number
  gecorrigeerd: boolean
  correctieReden: string | null
  aantalStuks: number | null
  /** Seconden × uurtarief; null als de regel (nog) niet meetelt of de machine geen tarief heeft. */
  kosten: number | null
}

export interface MachineNacalculatie {
  sleutel: string
  naam: string
  /** Null: deze machine staat niet in de calculatie, er is alleen op gewerkt. */
  gecalculeerd: Omit<GecalculeerdeMachine, 'sleutel' | 'naam'> | null
  /** Null: er is niets afgerond op deze machine geklokt. */
  werkelijk: {
    instelSeconden: number
    draaienSeconden: number
    onbemandSeconden: number
    instelKosten: number
    draaienKosten: number
    stuks: number
  } | null
  /** Geklokt op een naam die geen machine uit de lijst is: dan is er geen tarief. */
  tariefOnbekend: boolean
  gecalculeerdTotaal: number
  werkelijkTotaal: number
  verschil: number
  verschilPct: number | null
  klokregels: Klokregel[]
}

/**
 * Calculatie en klokregels per machine naast elkaar.
 *
 * Een machine uit de calculatie waar niet op geklokt is blijft staan ("niet
 * gebruikt"), en een machine waar wel op geklokt is maar die niet gecalculeerd
 * was komt erbij. Zo zie je allebei als het werk naar een andere machine ging —
 * anders verdwijnt de gecalculeerde machine en lijkt de andere duur zonder reden.
 *
 * Alleen afgeronde regels tellen mee, net als in `telUren`; lopende staan erbij
 * zodat je ziet dat er nog iets komt. `tarief` geeft het uurtarief van een
 * machinenaam (bemand of onbemand) of `null` als die naam geen machine is.
 */
export function bouwMachineNacalculatie(
  gecalc: GecalculeerdeMachine[],
  regels: Omit<Klokregel, 'kosten'>[],
  tarief: (machineNaam: string | null, bemand: boolean) => number | null,
): MachineNacalculatie[] {
  const uit = new Map<string, MachineNacalculatie>()
  const leeg = (sleutel: string, naam: string): MachineNacalculatie => ({
    sleutel, naam, gecalculeerd: null, werkelijk: null, tariefOnbekend: false,
    gecalculeerdTotaal: 0, werkelijkTotaal: 0, verschil: 0, verschilPct: null, klokregels: [],
  })

  for (const g of gecalc) {
    const { sleutel, naam, ...rest } = g
    uit.set(sleutel, { ...leeg(sleutel, naam), gecalculeerd: rest })
  }

  const gesorteerd = [...regels].sort((a, b) => a.gestartOp.localeCompare(b.gestartOp))
  for (const r of gesorteerd) {
    const naam = r.machineNaam?.trim() || 'Geen machine'
    const sleutel = machineSleutel(naam)
    const m = uit.get(sleutel) ?? leeg(sleutel, naam)
    uit.set(sleutel, m)

    const uurtarief = tarief(r.machineNaam, r.bemand)
    if (uurtarief === null) m.tariefOnbekend = true
    const telt = r.status === 'afgerond'
    const kosten = telt && uurtarief !== null ? (r.seconden / 3600) * uurtarief : null
    m.klokregels.push({ ...r, kosten })
    if (!telt) continue

    const w = m.werkelijk ?? {
      instelSeconden: 0, draaienSeconden: 0, onbemandSeconden: 0,
      instelKosten: 0, draaienKosten: 0, stuks: 0,
    }
    if (!r.bemand) w.onbemandSeconden += r.seconden
    if (r.soort === 'instellen') {
      w.instelSeconden += r.seconden
      w.instelKosten += kosten ?? 0
    } else {
      w.draaienSeconden += r.seconden
      w.draaienKosten += kosten ?? 0
      w.stuks += r.aantalStuks ?? 0
    }
    m.werkelijk = w
  }

  for (const m of uit.values()) {
    m.gecalculeerdTotaal = m.gecalculeerd ? m.gecalculeerd.instelKosten + m.gecalculeerd.draaienKosten : 0
    m.werkelijkTotaal = m.werkelijk ? m.werkelijk.instelKosten + m.werkelijk.draaienKosten : 0
    m.verschil = m.werkelijkTotaal - m.gecalculeerdTotaal
    // Alleen een percentage als er aan beide kanten iets staat: "−100 %" bij een
    // ongebruikte machine of "∞" bij een niet-gecalculeerde zegt niets.
    m.verschilPct = m.gecalculeerd && m.werkelijk ? pct(m.verschil, m.gecalculeerdTotaal) : null
  }
  return [...uit.values()]
}
