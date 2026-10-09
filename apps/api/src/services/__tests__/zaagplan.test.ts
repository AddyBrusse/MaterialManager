import { describe, it, expect } from 'vitest'
import { materiaalVoorstellen, vergelijkVoorstel, type PlanStaaf, type TeZagen, type Voorstel } from '@stockmanager/shared'

function staaf(id: string, vrijMm: number): PlanStaaf {
  return { id, code: `#${id}`, vrijMm }
}
const stangen = (lengtes: number[], stuks = 13): TeZagen[] => lengtes.map((lengteMm) => ({ lengteMm, stuks }))

// Het voorbeeld uit de mockup van 2026-10-09: 6 laderstangen van 1174 en één van 206.
const MOCKUP = { stangen: [...stangen([1174, 1174, 1174, 1174, 1174, 1174]), { lengteMm: 206, stuks: 2 }], zaagsnedeMm: 3, schrootDrempelMm: 200 }
const VOORRAAD = [staaf('rest1180', 1180), staaf('rest3535', 3535), staaf('a3000', 3000), staaf('b3000', 3000), staaf('c6000', 6000)]

describe('materiaalVoorstellen', () => {
  it('het beste voorstel maakt de restanten op die precies passen', () => {
    const [beste] = materiaalVoorstellen({ ...MOCKUP, staven: VOORRAAD })
    expect(beste.tekortStuks).toBe(0)
    expect(beste.stavenOp).toBe(2)
    const op = beste.regels.filter((r) => r.restWordtSchroot).map((r) => r.barId).sort()
    expect(op).toEqual(['rest1180', 'rest3535'])
    // En snijdt dan liever de lange staaf aan dan van een 3 m staaf een korte rest over te houden.
    const aangesneden = beste.regels.find((r) => !r.restWordtSchroot)!
    expect(aangesneden.barId).toBe('c6000')
    expect(aangesneden.restMm).toBe(6000 - 2 * 1177 - 209)
  })

  it('80 stuks gelijk verdeeld (3 × 1086 + 4 × 998): vindt dat 3 × 998 precies in 3000 past', () => {
    const st = [...stangen([1086, 1086, 1086], 12), ...stangen([998, 998, 998, 998], 11)]
    const [beste] = materiaalVoorstellen({ stangen: st, zaagsnedeMm: 3, schrootDrempelMm: 200, staven: VOORRAAD })
    const per = Object.fromEntries(beste.regels.map((r) => [r.barId, r]))
    expect(per.a3000 ?? per.b3000).toMatchObject({ restMm: 0, restWordtSchroot: true })
    expect(per.rest1180).toMatchObject({ restWordtSchroot: true })
    expect(per.c6000.restMm).toBe(6000 - 2 * 1089 - 1001)
    expect(beste.regels).toHaveLength(3)
  })

  it('geeft meerdere verschillende voorstellen, het beste eerst', () => {
    const v = materiaalVoorstellen({ ...MOCKUP, staven: VOORRAAD })
    expect(v.length).toBeGreaterThan(1)
    expect(new Set(v.map((x) => x.sleutel)).size).toBe(v.length)
    for (let i = 1; i < v.length; i++) expect(vergelijkVoorstel(v[i - 1], v[i])).toBeLessThanOrEqual(0)
  })

  it('vraagt nooit meer van een staaf dan er vrij is, en telt alle stuks', () => {
    for (const v of materiaalVoorstellen({ ...MOCKUP, staven: VOORRAAD })) {
      for (const r of v.regels) {
        expect(r.verbruikMm).toBeLessThanOrEqual(r.vrijMm)
        expect(r.restMm).toBe(r.vrijMm - r.verbruikMm)
      }
      expect(v.gedekt + v.tekortStuks).toBe(6 * 13 + 2)
    }
  })

  it('de laatste stang van een staaf hoeft geen zaagsnede als hij precies tot het eind loopt', () => {
    const [v] = materiaalVoorstellen({ stangen: stangen([1000]), zaagsnedeMm: 3, schrootDrempelMm: 200, staven: [staaf('x', 1000)] })
    expect(v.regels[0]).toMatchObject({ verbruikMm: 1000, restMm: 0, restWordtSchroot: true })
  })

  it('meldt een tekort met de lengtes die nog nodig zijn', () => {
    const [v] = materiaalVoorstellen({ stangen: stangen([1174, 1174, 1174]), zaagsnedeMm: 3, schrootDrempelMm: 200, staven: [staaf('x', 2400)] })
    expect(v.gedekt).toBe(26)
    expect(v.tekortStuks).toBe(13)
    expect(v.tekortStangen).toEqual([{ lengteMm: 1174, stuks: 13 }])
    expect(v.tekortMm).toBe(1177)
  })

  it('zonder voorraad: één voorstel met alles als tekort', () => {
    const v = materiaalVoorstellen({ stangen: stangen([500, 500]), zaagsnedeMm: 3, schrootDrempelMm: 200, staven: [] })
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ gedekt: 0, tekortStuks: 26, regels: [] })
  })

  it('negeert staven zonder vrije lengte', () => {
    const [v] = materiaalVoorstellen({ stangen: stangen([500]), zaagsnedeMm: 3, schrootDrempelMm: 200, staven: [staaf('leeg', 0), staaf('x', 3000)] })
    expect(v.regels.map((r) => r.barId)).toEqual(['x'])
  })
})

describe('vergelijkVoorstel', () => {
  const v = (p: Partial<Voorstel>): Voorstel => ({
    sleutel: '', regels: [], gedekt: 10, tekortStuks: 0, tekortStangen: [], tekortMm: 0,
    stavenOp: 0, schrootMm: 0, kortsteRestMm: null, ...p,
  })
  it('dekking, dan staven op, dan schroot, dan geen korte rest', () => {
    expect(vergelijkVoorstel(v({ gedekt: 10 }), v({ gedekt: 9, stavenOp: 5 }))).toBeLessThan(0)
    expect(vergelijkVoorstel(v({ stavenOp: 2, schrootMm: 100 }), v({ stavenOp: 1 }))).toBeLessThan(0)
    expect(vergelijkVoorstel(v({ schrootMm: 5 }), v({ schrootMm: 50 }))).toBeLessThan(0)
    expect(vergelijkVoorstel(v({ kortsteRestMm: 3000 }), v({ kortsteRestMm: 400 }))).toBeLessThan(0)
  })
})
