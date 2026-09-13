/**
 * Welke staven zaag je, en op welke lengte, voor een bepaald aantal stuks.
 *
 * Draaiwerk gaat hier via een stangenlader: de draaibank trekt een stang van
 * pakweg 500–1100 mm naar binnen. De vraag is dus niet alleen "welke staaf",
 * maar ook "op welke lengte zagen we hem", en die twee hangen samen.
 *
 * De rekenkern is bewust puur: geen database, geen fetch. Hij krijgt de vrije
 * lengtes mee en geeft een plan terug — beslissen wat ermee gebeurt doet de
 * aanroeper.
 *
 * ── De maten ──────────────────────────────────────────────────────────────
 *
 *   werkstuk       de kale lengte van het product
 *   vlakToeslag    extra per stuk om af te vlakken
 *   afsteek        wat de afsteekbeitel wegneemt per stuk
 *   steekbreedte   de zaagsnede per stuk (op de zaag, niet op de draaibank)
 *   opspanlengte   het staartje dat de lader niet meer kan pakken — per
 *                  laderstang één keer verloren
 *
 *   stukLengte  = werkstuk + vlakToeslag + afsteek + steekbreedte
 *   laderstang  = k × stukLengte + opspanlengte, met min ≤ laderstang ≤ max
 *
 * ── De keuze ──────────────────────────────────────────────────────────────
 *
 * Door de laderlengte precies op `k × stukLengte + opspanlengte` te leggen is
 * er per laderstang per definitie niets over. Wat er dan nog te winnen valt zit
 * in de voorraadstaaf: hoeveel blijft er over als je er laderstangen uit zaagt.
 * Daarom wordt elke haalbare k geprobeerd (er zijn er hooguit een handvol) en
 * het plan met het minste écht verloren materiaal gekozen.
 *
 * "Écht verloren" is smaller dan "over": een restant dat boven de
 * schrootdrempel blijft gaat terug het rek in en is geen verlies. Alleen wat
 * daaronder valt is weg.
 *
 * Korte staven gaan voor — restjes opmaken — maar niet tegen elke prijs: laat
 * een korte staaf meer dan `MAX_SCHROOT_AANDEEL` van zichzelf als schroot
 * achter, dan gaat er eerst een langere voor. Dat is de afspraak uit de
 * beslissing van 2026-09-11.
 */

/** Boven dit aandeel schroot van de eigen lengte verliest een korte staaf zijn
 *  voorrang. 15%: een restje opmaken is goed, een halve staaf weggooien niet. */
export const MAX_SCHROOT_AANDEEL = 0.15

export interface ZaagParams {
  /** Zaagsnede per stuk. */
  steekbreedte: number
  /** Afvlakken per stuk. */
  vlakToeslag: number
  /** Wat de afsteekbeitel wegneemt per stuk. */
  afsteek: number
  /** Staartje dat de lader niet meer pakt — één keer per laderstang. */
  opspanlengte: number
}

export interface LoaderGrenzen {
  minMm: number
  maxMm: number
}

export interface PlanStaaf {
  id: string
  code: string
  /** Vrije lengte: fysiek minus wat er al gereserveerd ligt. */
  vrijMm: number
  locatie?: string | null
}

export interface ZaagPlanInvoer {
  aantal: number
  werkstukLengteMm: number
  params: ZaagParams
  loader: LoaderGrenzen
  /** Restant hieronder is schroot; daarboven gaat het terug in het rek. */
  schrootDrempelMm: number
  staven: PlanStaaf[]
}

export interface PlanRegel {
  barId: string
  barCode: string
  locatie?: string | null
  /** Hoeveel hele laderstangen er uit deze staaf komen. */
  laderstangen: number
  /** Stuks die deze staaf levert. */
  stuks: number
  /** Wat er van de staaf af gaat. */
  verbruikMm: number
  /** Wat er van de staaf overblijft. */
  restMm: number
  /** Valt die rest onder de drempel, dan is hij weg. */
  restWordtSchroot: boolean
}

export interface ZaagPlan {
  /** Lengte die per stuk van de stang gaat, allowances inbegrepen. */
  stukLengteMm: number
  /** De gekozen laderlengte. */
  laderLengteMm: number
  /** Stuks per laderstang. */
  stuksPerLaderstang: number
  regels: PlanRegel[]
  /** Hoeveel van het gevraagde aantal dit plan dekt. */
  gedekt: number
  /** Wat er niet gedekt is. 0 betekent: alles ligt er. */
  tekort: number
  /** Hoeveel mm staf je nog nodig hebt voor dat tekort — de basis voor een
   *  bestelling. */
  tekortMm: number
  /** Totaal aan restanten die onder de drempel vallen. */
  schrootMm: number
}

/** Niets te plannen — een leeg plan in plaats van null, zodat het scherm er
 *  altijd hetzelfde mee omgaat. */
function leegPlan(stukLengteMm: number, aantal: number): ZaagPlan {
  return {
    stukLengteMm, laderLengteMm: 0, stuksPerLaderstang: 0, regels: [],
    gedekt: 0, tekort: aantal, tekortMm: aantal * stukLengteMm, schrootMm: 0,
  }
}

export function stukLengte(werkstukLengteMm: number, p: ZaagParams): number {
  return werkstukLengteMm + p.vlakToeslag + p.afsteek + p.steekbreedte
}

/**
 * De laderlengtes die de moeite waard zijn, langste eerst.
 *
 * Alleen lengtes die precies op een heel aantal stuks uitkomen: alles
 * daartussenin laat per laderstang een stuk onbenut. Grote k eerst, want dat
 * betekent minder stangwissels voor de operator.
 */
export function kandidaatLengtes(stukLen: number, p: ZaagParams, loader: LoaderGrenzen): number[] {
  if (stukLen <= 0) return []
  const uit: number[] = []
  const kMax = Math.floor((loader.maxMm - p.opspanlengte) / stukLen)
  for (let k = kMax; k >= 1; k--) {
    const lengte = k * stukLen + p.opspanlengte
    if (lengte >= loader.minMm && lengte <= loader.maxMm) uit.push(lengte)
  }
  return uit
}

/**
 * Verdeel het gevraagde aantal over de staven bij één vaste laderlengte.
 *
 * Korte staven eerst, maar een staaf die meer dan `MAX_SCHROOT_AANDEEL` van
 * zichzelf als schroot achterlaat gaat achteraan — die pakken we pas als er
 * niets beters is.
 */
function verdeel(
  invoer: ZaagPlanInvoer, stukLen: number, laderLen: number,
): ZaagPlan {
  const stuksPerLaderstang = Math.floor((laderLen - invoer.params.opspanlengte) / stukLen)
  if (stuksPerLaderstang <= 0) return leegPlan(stukLen, invoer.aantal)

  // Per staaf: wat levert hij op en wat blijft er liggen als we hem volledig
  // benutten. Dat bepaalt de volgorde.
  const kandidaten = invoer.staven
    .map((s) => {
      const stangen = Math.floor(s.vrijMm / laderLen)
      const rest = s.vrijMm - stangen * laderLen
      const schroot = rest > 0 && rest < invoer.schrootDrempelMm ? rest : 0
      return { staaf: s, stangen, rest, schroot }
    })
    .filter((k) => k.stangen > 0)
    .sort((a, b) => {
      // Duur = een staaf die een groot deel van zichzelf als schroot achterlaat.
      const duurA = a.staaf.vrijMm > 0 && a.schroot / a.staaf.vrijMm > MAX_SCHROOT_AANDEEL ? 1 : 0
      const duurB = b.staaf.vrijMm > 0 && b.schroot / b.staaf.vrijMm > MAX_SCHROOT_AANDEEL ? 1 : 0
      if (duurA !== duurB) return duurA - duurB
      if (a.staaf.vrijMm !== b.staaf.vrijMm) return a.staaf.vrijMm - b.staaf.vrijMm
      return a.schroot - b.schroot
    })

  const regels: PlanRegel[] = []
  let nog = invoer.aantal

  for (const k of kandidaten) {
    if (nog <= 0) break
    const nodigeStangen = Math.ceil(nog / stuksPerLaderstang)
    const stangen = Math.min(k.stangen, nodigeStangen)
    const stuks = Math.min(nog, stangen * stuksPerLaderstang)
    const verbruikMm = stangen * laderLen
    const restMm = k.staaf.vrijMm - verbruikMm
    regels.push({
      barId: k.staaf.id,
      barCode: k.staaf.code,
      locatie: k.staaf.locatie ?? null,
      laderstangen: stangen,
      stuks,
      verbruikMm,
      restMm,
      // Alleen een restant dat écht overblijft telt: gebruiken we de staaf niet
      // helemaal op, dan blijft de rest gewoon in het rek liggen.
      restWordtSchroot: restMm > 0 && restMm < invoer.schrootDrempelMm,
    })
    nog -= stuks
  }

  const gedekt = invoer.aantal - nog
  return {
    stukLengteMm: stukLen,
    laderLengteMm: laderLen,
    stuksPerLaderstang,
    regels,
    gedekt,
    tekort: nog,
    tekortMm: nog * stukLen,
    schrootMm: regels.filter((r) => r.restWordtSchroot).reduce((s, r) => s + r.restMm, 0),
  }
}

/**
 * Het beste plan: dekking eerst, dan zo min mogelijk écht verloren materiaal,
 * dan zo min mogelijk stangwissels.
 */
export function planZaagwerk(invoer: ZaagPlanInvoer): ZaagPlan {
  const stukLen = stukLengte(invoer.werkstukLengteMm, invoer.params)
  if (stukLen <= 0 || invoer.aantal <= 0) return leegPlan(Math.max(0, stukLen), Math.max(0, invoer.aantal))

  const lengtes = kandidaatLengtes(stukLen, invoer.params, invoer.loader)
  if (lengtes.length === 0) return leegPlan(stukLen, invoer.aantal)

  let beste: ZaagPlan | null = null
  for (const lengte of lengtes) {
    const plan = verdeel(invoer, stukLen, lengte)
    if (!beste) { beste = plan; continue }
    // 1. meer gedekt wint altijd — materiaal dat er niet ligt is het probleem,
    //    niet een paar millimeter afval
    if (plan.gedekt !== beste.gedekt) { if (plan.gedekt > beste.gedekt) beste = plan; continue }
    // 2. minder écht verloren materiaal
    if (plan.schrootMm !== beste.schrootMm) { if (plan.schrootMm < beste.schrootMm) beste = plan; continue }
    // 3. minder stangwissels voor de operator
    const stangenNieuw = plan.regels.reduce((s, r) => s + r.laderstangen, 0)
    const stangenBeste = beste.regels.reduce((s, r) => s + r.laderstangen, 0)
    if (stangenNieuw < stangenBeste) beste = plan
  }
  return beste ?? leegPlan(stukLen, invoer.aantal)
}
