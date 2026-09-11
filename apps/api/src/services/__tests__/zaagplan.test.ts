import { describe, it, expect } from 'vitest'
import {
  planZaagwerk, kandidaatLengtes, stukLengte,
  type ZaagPlanInvoer, type PlanStaaf,
} from '@stockmanager/shared'

const params = { steekbreedte: 3, vlakToeslag: 3, afsteek: 4, opspanlengte: 30 }
const loader = { minMm: 500, maxMm: 1100 }

function invoer(p: Partial<ZaagPlanInvoer> & { staven: PlanStaaf[] }): ZaagPlanInvoer {
  return {
    aantal: 10, werkstukLengteMm: 100, params, loader, schrootDrempelMm: 200,
    ...p,
  }
}

function staaf(id: string, vrijMm: number): PlanStaaf {
  return { id, code: `#${id}`, vrijMm }
}

describe('stukLengte', () => {
  it('telt alle toeslagen bij de kale werkstuklengte op', () => {
    // 100 werkstuk + 3 vlak + 4 afsteek + 3 zaagsnede
    expect(stukLengte(100, params)).toBe(110)
  })
})

describe('kandidaatLengtes', () => {
  it('geeft alleen lengtes die op een heel aantal stuks uitkomen', () => {
    // Elke lengte is k × 110 + 30 opspanlengte; alles daartussenin zou per
    // laderstang een stuk onbenut laten.
    const lengtes = kandidaatLengtes(110, params, loader)
    expect(lengtes.every((l) => (l - 30) % 110 === 0)).toBe(true)
  })

  it('blijft binnen de grenzen van de lader', () => {
    for (const l of kandidaatLengtes(110, params, loader)) {
      expect(l).toBeGreaterThanOrEqual(500)
      expect(l).toBeLessThanOrEqual(1100)
    }
  })

  it('zet de langste voorop — minder stangwissels', () => {
    const lengtes = kandidaatLengtes(110, params, loader)
    expect(lengtes[0]).toBeGreaterThan(lengtes[lengtes.length - 1])
  })

  it('geeft niets terug als zelfs één stuk niet in de lader past', () => {
    expect(kandidaatLengtes(2000, params, loader)).toEqual([])
  })
})

describe('planZaagwerk', () => {
  it('dekt het gevraagde aantal en rekent het verbruik uit', () => {
    const plan = planZaagwerk(invoer({ aantal: 9, staven: [staaf('a', 3000)] }))
    expect(plan.tekort).toBe(0)
    expect(plan.gedekt).toBe(9)
    const stuks = plan.regels.reduce((s, r) => s + r.stuks, 0)
    expect(stuks).toBe(9)
    // Verbruik is altijd hele laderstangen: je zaagt geen halve.
    for (const r of plan.regels) {
      expect(r.verbruikMm).toBe(r.laderstangen * plan.laderLengteMm)
    }
  })

  it('maakt korte staven eerst op', () => {
    // Drie staven die het allemaal aankunnen; de kortste hoort gebruikt te
    // worden, want restjes opruimen is het doel.
    const plan = planZaagwerk(invoer({
      aantal: 5,
      staven: [staaf('lang', 6000), staaf('kort', 1200), staaf('midden', 3000)],
    }))
    expect(plan.regels[0].barId).toBe('kort')
  })

  it('slaat een korte staaf over die te veel schroot achterlaat', () => {
    // 'kort' heeft 1150 mm vrij: daar gaat één laderstang uit en er blijft een
    // restje over dat onder de drempel valt — meer dan 15% van die staaf.
    // 'lang' laat niets liggen. Dan gaat 'lang' voor.
    const plan = planZaagwerk(invoer({
      aantal: 4, schrootDrempelMm: 300,
      staven: [staaf('kort', 1150), staaf('lang', 4400)],
    }))
    expect(plan.regels[0].barId).toBe('lang')
  })

  it('verdeelt over meerdere staven als er één niet genoeg is', () => {
    const plan = planZaagwerk(invoer({
      aantal: 20, staven: [staaf('a', 1200), staaf('b', 1200), staaf('c', 1200)],
    }))
    expect(plan.regels.length).toBeGreaterThan(1)
    expect(plan.gedekt + plan.tekort).toBe(20)
  })

  it('meldt een tekort met de millimeters die nog nodig zijn', () => {
    // Eén staaf van 700 mm levert bij laderlengte 690 (6×110+30) zes stuks.
    const plan = planZaagwerk(invoer({ aantal: 50, staven: [staaf('a', 700)] }))
    expect(plan.tekort).toBeGreaterThan(0)
    expect(plan.tekortMm).toBe(plan.tekort * plan.stukLengteMm)
  })

  it('geeft een leeg plan zonder staven, met het volledige aantal als tekort', () => {
    const plan = planZaagwerk(invoer({ aantal: 8, staven: [] }))
    expect(plan.gedekt).toBe(0)
    expect(plan.tekort).toBe(8)
    expect(plan.regels).toEqual([])
  })

  it('telt een restant boven de drempel niet als schroot', () => {
    // 3000 vrij, laderlengte 690 → 4 stangen = 2760, rest 240. Met een drempel
    // van 200 blijft dat gewoon in het rek liggen.
    const plan = planZaagwerk(invoer({
      aantal: 24, schrootDrempelMm: 200, staven: [staaf('a', 3000)],
    }))
    const rest = plan.regels[0]
    if (rest.restMm >= 200) expect(rest.restWordtSchroot).toBe(false)
    expect(plan.schrootMm).toBe(0)
  })

  it('rekent met de vrije lengte, niet met de fysieke', () => {
    // De aanroeper geeft vrijMm mee; een staaf waarvan alles al vastligt levert
    // niets. Anders zou je materiaal inplannen dat al voor een ander project is.
    const plan = planZaagwerk(invoer({ aantal: 5, staven: [staaf('vol', 0)] }))
    expect(plan.gedekt).toBe(0)
    expect(plan.tekort).toBe(5)
  })

  it('vraagt nooit meer van een staaf dan er vrij is', () => {
    const plan = planZaagwerk(invoer({
      aantal: 100, staven: [staaf('a', 1500), staaf('b', 2000)],
    }))
    const perStaaf = new Map([['a', 1500], ['b', 2000]])
    for (const r of plan.regels) {
      expect(r.verbruikMm).toBeLessThanOrEqual(perStaaf.get(r.barId)!)
      expect(r.restMm).toBeGreaterThanOrEqual(0)
    }
  })

  it('kiest bij gelijke dekking het plan met minder schroot', () => {
    // Twee laderlengtes dekken allebei het aantal; de keuze hoort te vallen op
    // de variant die minder materiaal echt weggooit.
    const plan = planZaagwerk(invoer({
      aantal: 6, schrootDrempelMm: 400, staven: [staaf('a', 2000)],
    }))
    expect(plan.gedekt).toBe(6)
    expect(plan.schrootMm).toBe(0)
  })
})
