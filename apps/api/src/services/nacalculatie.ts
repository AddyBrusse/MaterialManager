// Nacalculatie: wat een order werkelijk kostte, naast wat ervoor gecalculeerd was.
//
// De rekenkunde staat in `@stockmanager/shared` (calc/nacalculatie.ts) en de
// indeling is met opzet dezelfde vier posten als `computeEstimateTotals`. Deze
// laag doet alleen het ophalen: uren uit de tijdregistratie, materiaal uit de
// afgeboekte zaagbonnen, verkoopprijs uit de offerteregel.
//
// Niets hiervan wordt opgeslagen. Een nacalculatie die je bewaart is een
// momentopname die stil achterloopt zodra er een uur bijkomt of een correctie
// gemaakt wordt; afleiden kost een paar queries en klopt altijd.
import type { Prisma } from '@prisma/client'
import {
  bouwNacalculatie, computeEstimateTotals, buildEstimateCtx, computeWeightKg,
  effectieveSeconden, adviesInstelMinuten, adviesCycleMinuten,
  type Nacalculatie, type GemetenUren, type ArticleEstimate, type ArticleRecipe,
  type EstimateTotals, type VolumeFormula,
} from '@stockmanager/shared'

type Db = Prisma.TransactionClient

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0)
}

interface Tarieven {
  /** Per machinenaam: wat de machine kost, en wat de operator er bovenop kost. */
  perNaam: Map<string, { machine: number; operator: number }>
}

async function tarievenLaden(db: Db): Promise<Tarieven> {
  const machines = await db.machine.findMany()
  const perNaam = new Map<string, { machine: number; operator: number }>()
  for (const m of machines) {
    perNaam.set(m.name, {
      machine: num(m.machineRatePerHour),
      operator: num(m.operatorRatePerHour),
    })
  }
  return { perNaam }
}

/**
 * Wat een uur op deze machine werkelijk kost.
 *
 * Onbemand telt alleen het machinetarief — dat is precies de besparing die
 * onbemand draaien oplevert, en de calculatie rekent altijd met beide, dus het
 * verschil hoort zichtbaar te worden in plaats van weggepoetst.
 */
function uurtarief(t: Tarieven, machineNaam: string | null, bemand: boolean): number {
  const m = machineNaam ? t.perNaam.get(machineNaam) : undefined
  if (!m) return 0
  return bemand ? m.machine + m.operator : m.machine
}

interface RegistratieRij {
  soort: string
  bemand: boolean
  status: string
  machineNaam: string | null
  gemetenSeconden: number
  bijgesteldeSeconden: number | null
  lopendSinds: Date | null
  aantalStuks: number | null
}

/**
 * Uren optellen. Alleen afgeronde registraties: lopend werk is nog geen feit, en
 * een klok die nu toevallig draait hoort een nacalculatie niet te laten schommelen.
 */
export function telUren(rijen: RegistratieRij[], tarieven: Tarieven): GemetenUren & { stuks: number; instelMetingen: number[] } {
  let instellenSeconden = 0, draaienSeconden = 0
  let instellenKosten = 0, draaienKosten = 0, onbemandSeconden = 0
  let aantalRegistraties = 0, stuks = 0
  const instelMetingen: number[] = []

  for (const r of rijen) {
    if (r.status !== 'afgerond') continue
    const sec = effectieveSeconden({
      gemetenSeconden: r.gemetenSeconden,
      bijgesteldeSeconden: r.bijgesteldeSeconden,
      lopendSinds: null,
    })
    const kosten = (sec / 3600) * uurtarief(tarieven, r.machineNaam, r.bemand)
    aantalRegistraties += 1
    if (!r.bemand) onbemandSeconden += sec
    if (r.soort === 'instellen') {
      instellenSeconden += sec
      instellenKosten += kosten
      instelMetingen.push(sec)
    } else {
      draaienSeconden += sec
      draaienKosten += kosten
      stuks += r.aantalStuks ?? 0
    }
  }
  return {
    instellenSeconden, draaienSeconden, instellenKosten, draaienKosten,
    onbemandSeconden, aantalRegistraties, stuks, instelMetingen,
  }
}

/**
 * Werkelijk materiaalverbruik in euro's, uit de afgeboekte zaagbonnen.
 *
 * Alleen afgeboekte reserveringen ('done'): open reserveringen houden materiaal
 * vast maar hebben het nog niet verbruikt. Het gewicht volgt uit de fysieke
 * lengte die van de staaf af is gegaan, tegen de kiloprijs van de kwaliteit.
 *
 * Null als er niets afgeboekt is — dan valt er over materiaal niets te zeggen en
 * is het eerlijker om het gecalculeerde bedrag te laten staan dan een nul te
 * tonen die als besparing gelezen wordt.
 */
export async function materiaalWerkelijk(
  db: Db, waar: { projectId?: string; artikelId?: string },
): Promise<number | null> {
  const reserveringen = await db.zaagReservering.findMany({
    where: { ...waar, status: 'done' },
  })
  if (reserveringen.length === 0) return null

  const grades = await db.grade.findMany()
  const profiles = await db.profile.findMany()

  let totaal = 0
  for (const r of reserveringen) {
    // De zaagbon noemt de kwaliteit bij naam, niet bij id.
    const grade = grades.find((g) => g.name === r.materiaal)
    if (!grade || grade.pricePerKg == null) continue
    // Een zaagbon is altijd rond materiaal uit de stangenlader; het profiel doet
    // er alleen toe voor de volumeformule en die is hier bekend.
    const profiel = profiles.find((p) => p.volumeFormula === 'round')
    const formule = (profiel?.volumeFormula ?? 'round') as VolumeFormula
    const kg = computeWeightKg(
      formule,
      { diameter: num(r.diameter) },
      num(r.fysiekeLengte),
      num(grade.densityKgM3),
    )
    totaal += kg * num(grade.pricePerKg)
  }
  return totaal
}

/** De calculatie van een artikel, herrekend bij dit aantal. */
async function geschatVoorArtikel(
  db: Db, artikelId: string, qty: number,
): Promise<EstimateTotals | null> {
  const artikel = await db.article.findUnique({ where: { id: artikelId } })
  if (!artikel || !artikel.estimate) return null
  const [grades, machines, profiles] = await Promise.all([
    db.grade.findMany(), db.machine.findMany(), db.profile.findMany(),
  ])
  const ctx = buildEstimateCtx(
    { recipe: (artikel.recipe ?? null) as ArticleRecipe | null },
    grades.map((g) => ({
      id: g.id, densityKgM3: num(g.densityKgM3),
      pricePerKg: g.pricePerKg != null ? num(g.pricePerKg) : undefined,
    })),
    profiles.map((p) => ({ id: p.id, volumeFormula: p.volumeFormula })),
    machines.map((m) => ({
      id: m.id, machineRatePerHour: num(m.machineRatePerHour),
      operatorRatePerHour: num(m.operatorRatePerHour),
    })),
  )
  return computeEstimateTotals(artikel.estimate as unknown as ArticleEstimate, ctx, qty)
}

export interface OrderNacalculatie extends Nacalculatie {
  orderId: string
  projectId: string
  artikelId: string | null
  artikelNaam: string
  status: string
  /** Aantal stuks dat volgens de registraties gemaakt is. */
  gemaakteStuks: number
  /** Wat de metingen als nieuwe norm zouden adviseren. Null bij te weinig data. */
  advies: { instelMin: number | null; cycleMin: number | null } | null
}

/** Nacalculatie van één productieorder — de regel die in het project staat. */
export async function voorOrder(db: Db, orderId: string): Promise<OrderNacalculatie | null> {
  const order = await db.productieOrder.findUnique({ where: { id: orderId } })
  if (!order) return null
  return bouwVoorOrder(db, order)
}

type OrderRij = {
  id: string; projectId: string; offerteRegelId: string
  artikelId: string | null; artikelNaam: string; qty: number; status: string
}

async function bouwVoorOrder(db: Db, order: OrderRij): Promise<OrderNacalculatie | null> {
  if (!order.artikelId) return null
  const geschat = await geschatVoorArtikel(db, order.artikelId, order.qty)
  if (!geschat) return null

  const [tarieven, registraties, regel] = await Promise.all([
    tarievenLaden(db),
    db.tijdRegistratie.findMany({ where: { orderId: order.id } }),
    db.offerteRegel.findUnique({ where: { id: order.offerteRegelId } }),
  ])
  const uren = telUren(registraties, tarieven)
  const materiaal = await materiaalWerkelijk(db, {
    projectId: order.projectId, artikelId: order.artikelId,
  })

  const basis = bouwNacalculatie({
    qty: order.qty,
    geschat,
    gemeten: uren,
    materiaalWerkelijk: materiaal,
    externWerkelijk: null,
    verkoopTotaal: regel ? regel.verkoopprijs * regel.qty : null,
  })

  return {
    ...basis,
    orderId: order.id,
    projectId: order.projectId,
    artikelId: order.artikelId,
    artikelNaam: order.artikelNaam,
    status: order.status,
    gemaakteStuks: uren.stuks,
    advies: {
      instelMin: adviesInstelMinuten(uren.instelMetingen),
      cycleMin: adviesCycleMinuten(uren.draaienSeconden, uren.stuks || order.qty),
    },
  }
}

export interface ProjectNacalculatie {
  projectId: string
  orders: OrderNacalculatie[]
  gecalculeerdTotaal: number
  werkelijkTotaal: number
  verschilTotaal: number
  verschilPct: number | null
  verkoopTotaal: number | null
  margeWerkelijkPct: number | null
  margeGecalculeerdPct: number | null
  gemeten: boolean
}

/** Nacalculatie van een heel project: de orders opgeteld. */
export async function voorProject(db: Db, projectId: string): Promise<ProjectNacalculatie> {
  const orders = await db.productieOrder.findMany({
    where: { projectId }, orderBy: { id: 'asc' },
  })
  const resultaten: OrderNacalculatie[] = []
  for (const o of orders) {
    const n = await bouwVoorOrder(db, o)
    if (n) resultaten.push(n)
  }

  const gecalculeerdTotaal = resultaten.reduce((s, r) => s + r.gecalculeerdTotaal, 0)
  const werkelijkTotaal = resultaten.reduce((s, r) => s + r.werkelijkTotaal, 0)
  const verkoopTotaal = resultaten.some((r) => r.verkoopTotaal != null)
    ? resultaten.reduce((s, r) => s + (r.verkoopTotaal ?? 0), 0)
    : null
  const verschilTotaal = werkelijkTotaal - gecalculeerdTotaal

  return {
    projectId,
    orders: resultaten,
    gecalculeerdTotaal,
    werkelijkTotaal,
    verschilTotaal,
    verschilPct: gecalculeerdTotaal === 0 ? null : (verschilTotaal / gecalculeerdTotaal) * 100,
    verkoopTotaal,
    margeWerkelijkPct: verkoopTotaal && verkoopTotaal > 0
      ? ((verkoopTotaal - werkelijkTotaal) / verkoopTotaal) * 100 : null,
    margeGecalculeerdPct: verkoopTotaal && verkoopTotaal > 0
      ? ((verkoopTotaal - gecalculeerdTotaal) / verkoopTotaal) * 100 : null,
    gemeten: resultaten.some((r) => r.gemeten),
  }
}

export interface ArtikelNacalculatie {
  artikelId: string
  orders: OrderNacalculatie[]
  /** Over alle orders heen: hoe vaak dit artikel gemeten is. */
  aantalOrders: number
  gemetenOrders: number
  /** Gewogen gemiddeld verschil, zodat één kleine order het beeld niet kantelt. */
  verschilPct: number | null
  advies: { instelMin: number | null; cycleMin: number | null }
  /** De norm zoals hij nu in de calculatie staat, om het advies tegen af te zetten. */
  huidig: { instelMin: number; cycleMinPerStuk: number } | null
}

/**
 * Nacalculatie per artikel, over alle orders heen.
 *
 * Dit is de vorm waar de calculatie iets aan heeft: één order is een anekdote,
 * drie metingen zijn een norm.
 */
export async function voorArtikel(db: Db, artikelId: string): Promise<ArtikelNacalculatie> {
  const orders = await db.productieOrder.findMany({
    where: { artikelId }, orderBy: { id: 'asc' },
  })
  const resultaten: OrderNacalculatie[] = []
  for (const o of orders) {
    const n = await bouwVoorOrder(db, o)
    if (n) resultaten.push(n)
  }

  const [tarieven, alleRegistraties] = await Promise.all([
    tarievenLaden(db),
    db.tijdRegistratie.findMany({ where: { artikelId, status: 'afgerond' } }),
  ])
  const uren = telUren(alleRegistraties, tarieven)

  const gemeten = resultaten.filter((r) => r.gemeten)
  const gecalc = gemeten.reduce((s, r) => s + r.gecalculeerdTotaal, 0)
  const werk = gemeten.reduce((s, r) => s + r.werkelijkTotaal, 0)

  const huidig = await huidigeNorm(db, artikelId)

  return {
    artikelId,
    orders: resultaten,
    aantalOrders: resultaten.length,
    gemetenOrders: gemeten.length,
    verschilPct: gecalc === 0 ? null : ((werk - gecalc) / gecalc) * 100,
    advies: {
      instelMin: adviesInstelMinuten(uren.instelMetingen),
      cycleMin: adviesCycleMinuten(uren.draaienSeconden, uren.stuks),
    },
    huidig,
  }
}

async function huidigeNorm(db: Db, artikelId: string) {
  const artikel = await db.article.findUnique({ where: { id: artikelId } })
  if (!artikel || !artikel.estimate) return null
  const est = artikel.estimate as unknown as ArticleEstimate
  const machines = est.nodes.filter((n) => n.type === 'machine')
  if (machines.length === 0) return null
  return {
    instelMin: machines.reduce((s, n) => s + (n.setupMin ?? 0), 0),
    cycleMinPerStuk: machines.reduce(
      (s, n) => s + (n.steps ?? []).reduce((t, st) => t + (st.cycleMin || 0), 0), 0,
    ),
  }
}

/**
 * De norm bijstellen naar wat er gemeten is.
 *
 * Dit is het hele punt van de nacalculatie: zonder terugkoppeling naar de
 * calculatie is het een rapport dat niemand leest. De wijziging landt op de
 * machinenode van het artikel, waarna de aanroeper een prijssnapshot schrijft —
 * zo verschijnt de bijstelling ook in het prijsverloop van het artikel en zie je
 * later terug wanneer en waarom de kostprijs veranderde.
 *
 * Verdeelt over meerdere machinenodes naar rato van hun huidige aandeel, want
 * de meting zegt niets over wélke machine langer deed.
 */
export async function stelNormBij(
  db: Db, artikelId: string, nieuw: { instelMin?: number; cycleMinPerStuk?: number },
): Promise<ArticleEstimate> {
  const artikel = await db.article.findUnique({ where: { id: artikelId } })
  if (!artikel || !artikel.estimate) {
    throw new Error('Artikel heeft geen calculatie om bij te stellen')
  }
  const est = JSON.parse(JSON.stringify(artikel.estimate)) as ArticleEstimate
  const machineNodes = est.nodes.filter((n) => n.type === 'machine')
  if (machineNodes.length === 0) {
    throw new Error('Calculatie heeft geen machinebewerking om bij te stellen')
  }

  if (nieuw.instelMin != null) {
    const huidigTotaal = machineNodes.reduce((s, n) => s + (n.setupMin ?? 0), 0)
    for (const n of machineNodes) {
      const aandeel = huidigTotaal > 0 ? (n.setupMin ?? 0) / huidigTotaal : 1 / machineNodes.length
      n.setupMin = Math.round(nieuw.instelMin * aandeel)
    }
  }

  if (nieuw.cycleMinPerStuk != null) {
    const huidigTotaal = machineNodes.reduce(
      (s, n) => s + (n.steps ?? []).reduce((t, st) => t + (st.cycleMin || 0), 0), 0,
    )

    if (huidigTotaal === 0) {
      // Er staat nog helemaal geen cyclustijd in de calculatie — het gewone
      // geval bij een artikel waarvan alleen de insteltijd ingevuld was. De
      // meting overslaan zou de bijstelling stil laten mislukken (waargenomen
      // bij ART-0001: 24 min/stuk gemeten, calculatie bleef op 0 staan), dus
      // zetten we de gemeten tijd als één stap op de eerste machine.
      const doel = machineNodes[0]
      doel.steps = [{
        id: `stap_${Date.now()}`,
        name: 'Draaien (uit meting)',
        cycleMin: Math.round(nieuw.cycleMinPerStuk * 100) / 100,
      }]
    } else {
      for (const n of machineNodes) {
        const nodeTotaal = (n.steps ?? []).reduce((t, st) => t + (st.cycleMin || 0), 0)
        const stappen = n.steps ?? []
        if (stappen.length === 0) continue
        const aandeel = nodeTotaal / huidigTotaal
        const doel = nieuw.cycleMinPerStuk * aandeel
        // Binnen een node verdelen we net zo: de meting zegt niets over welke
        // bewerkingsstap langer duurde.
        for (const st of stappen) {
          const stapAandeel = nodeTotaal > 0 ? (st.cycleMin || 0) / nodeTotaal : 1 / stappen.length
          st.cycleMin = Math.round(doel * stapAandeel * 100) / 100
        }
      }
    }
  }

  est.updatedAt = new Date().toISOString()
  await db.article.update({ where: { id: artikelId }, data: { estimate: est as unknown as Prisma.InputJsonValue } })
  return est
}
