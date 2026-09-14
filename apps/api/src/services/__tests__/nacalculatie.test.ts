import { describe, it, expect } from 'vitest'
import {
  bouwNacalculatie, computeEstimateTotals, effectieveSeconden, secondenNaarKlok,
  adviesInstelMinuten, adviesCycleMinuten,
  type ArticleEstimate, type EstimateCtx,
} from '@stockmanager/shared'

// Eén machine van €80/u (45 machine + 35 operator), 120 min instellen en
// 110 min cyclus per stuk. Dezelfde opzet als het ontwerp, zodat de cijfers uit
// de schermen hier na te rekenen zijn.
const TARIEF = 45 + 35

const ctx: EstimateCtx = {
  grades: [{ id: 'g1', densityKgM3: 8000, pricePerKg: 6 }],
  machines: [{ id: 'm1', machineRatePerHour: 45, operatorRatePerHour: 35 }],
  profiles: [{ id: 'p1', volumeFormula: 'round' }],
  recipe: { profileId: 'p1', gradeId: 'g1', dimensions: { diameter: 50 }, lengthPerPieceMm: 150 },
  profileFormula: 'round',
}

const est: ArticleEstimate = {
  marginPct: 25,
  updatedAt: '2026-09-13T00:00:00.000Z',
  nodes: [
    {
      id: 'n1', type: 'material', name: 'RVS 316', gradeId: 'g1', profileId: 'p1',
      dimensions: { diameter: 50 }, lengthMm: 150, qty: 1,
    },
    {
      id: 'n2', type: 'machine', name: 'DMG', machineId: 'm1', setupMin: 120,
      steps: [{ id: 's1', name: 'draaien', cycleMin: 110 }],
    },
  ],
}

function gemeten(instellenSec: number, draaienSec: number, opts: { onbemandSec?: number } = {}) {
  return {
    instellenSeconden: instellenSec,
    draaienSeconden: draaienSec,
    instellenKosten: (instellenSec / 3600) * TARIEF,
    draaienKosten: (draaienSec / 3600) * TARIEF,
    onbemandSeconden: opts.onbemandSec ?? 0,
    aantalRegistraties: 2,
  }
}

describe('computeEstimateTotals: setup en cyclus apart', () => {
  it('geeft de minuten exact terug, niet verdeeld naar kostenverhouding', () => {
    const t = computeEstimateTotals(est, ctx, 12)
    expect(t.setupMin).toBe(120)
    expect(t.cycleMinPerPiece).toBe(110)
    // timeMin blijft wat het was: setup één keer, cyclus per stuk.
    expect(t.timeMin).toBe(120 + 12 * 110)
  })

  it('verdeelt insteltijd over de batch — dat is het hele punt van de splitsing', () => {
    const bij1 = computeEstimateTotals(est, ctx, 1)
    const bij12 = computeEstimateTotals(est, ctx, 12)
    expect(bij1.setupTotal).toBeCloseTo((120 / 60) * TARIEF, 6)
    expect(bij12.setupTotal).toBeCloseTo((120 / 60) * TARIEF / 12, 6)
    // Cyclus per stuk verandert niet met het aantal.
    expect(bij12.cycleTotal).toBeCloseTo(bij1.cycleTotal, 6)
  })
})

describe('bouwNacalculatie', () => {
  const qty = 12
  const t = computeEstimateTotals(est, ctx, qty)

  it('telt de posten op tot de kostprijs maal het aantal', () => {
    const n = bouwNacalculatie({
      qty, geschat: t, gemeten: gemeten(3 * 3600 + 15 * 60, 19 * 3600 + 10 * 60),
      materiaalWerkelijk: null, externWerkelijk: null, verkoopTotaal: null,
    })
    const som = n.regels.reduce((s, r) => s + r.gecalculeerd, 0)
    expect(som).toBeCloseTo(t.cost * qty, 6)
  })

  it('rekent instellen af tegen de batchnorm, niet per stuk', () => {
    const n = bouwNacalculatie({
      qty, geschat: t, gemeten: gemeten(3 * 3600 + 15 * 60, 19 * 3600 + 10 * 60),
      materiaalWerkelijk: null, externWerkelijk: null, verkoopTotaal: null,
    })
    const instellen = n.regels.find((r) => r.post === 'instellen')!
    expect(instellen.gecalculeerd).toBeCloseTo((120 / 60) * TARIEF, 6)
    expect(instellen.werkelijk).toBeCloseTo((3.25) * TARIEF, 6)
    // 2:00 u begroot, 3:15 u gemeten → +62,5%
    expect(instellen.verschilPct).toBeCloseTo(62.5, 6)
    expect(instellen.toelichting).toBe('2:00 u → 3:15 u')
  })

  it('laat draaien zien als besparing wanneer het sneller ging', () => {
    const n = bouwNacalculatie({
      qty, geschat: t, gemeten: gemeten(3 * 3600 + 15 * 60, 19 * 3600 + 10 * 60),
      materiaalWerkelijk: null, externWerkelijk: null, verkoopTotaal: null,
    })
    const draaien = n.regels.find((r) => r.post === 'draaien')!
    expect(draaien.verschilPct).toBeLessThan(0)
    expect(draaien.toelichting).toBe('22:00 u → 19:10 u')
  })

  /**
   * De belangrijkste eigenschap: zonder meting mag er geen besparing
   * verschijnen. Een nul tonen leest als "goedkoper uitgevallen" terwijl er
   * alleen nog niets geklokt is.
   */
  it('toont zonder metingen exact de calculatie, geen nul', () => {
    const n = bouwNacalculatie({
      qty, geschat: t,
      gemeten: {
        instellenSeconden: 0, draaienSeconden: 0, instellenKosten: 0,
        draaienKosten: 0, onbemandSeconden: 0, aantalRegistraties: 0,
      },
      materiaalWerkelijk: null, externWerkelijk: null, verkoopTotaal: t.sell * qty,
    })
    expect(n.gemeten).toBe(false)
    expect(n.werkelijkTotaal).toBeCloseTo(n.gecalculeerdTotaal, 6)
    expect(n.verschilTotaal).toBeCloseTo(0, 6)
    // En de marge is dan precies de calculatiemarge.
    expect(n.margeWerkelijkPct).toBeCloseTo((t.sell - t.cost) / t.sell * 100, 6)
  })

  it('rekent de marge over de hele order', () => {
    const verkoop = 5880
    const n = bouwNacalculatie({
      qty, geschat: t, gemeten: gemeten(3 * 3600, 19 * 3600),
      materiaalWerkelijk: null, externWerkelijk: null, verkoopTotaal: verkoop,
    })
    expect(n.margeWerkelijkEuro).toBeCloseTo(verkoop - n.werkelijkTotaal, 6)
    expect(n.margeWerkelijkPct).toBeCloseTo((verkoop - n.werkelijkTotaal) / verkoop * 100, 6)
  })

  it('geeft onbemande uren door zodat het scherm ze apart kan benoemen', () => {
    const n = bouwNacalculatie({
      qty, geschat: t, gemeten: gemeten(3 * 3600, 19 * 3600, { onbemandSec: 4 * 3600 }),
      materiaalWerkelijk: null, externWerkelijk: null, verkoopTotaal: null,
    })
    expect(n.onbemandSeconden).toBe(4 * 3600)
  })
})

describe('effectieveSeconden — de enige definitie van "werkelijk"', () => {
  it('laat een correctie winnen van de gemeten tijd', () => {
    expect(effectieveSeconden({
      gemetenSeconden: 4800, bijgesteldeSeconden: 2700, lopendSinds: null,
    })).toBe(2700)
  })

  it('telt een correctie van nul ook mee — niet als "geen correctie" lezen', () => {
    expect(effectieveSeconden({
      gemetenSeconden: 4800, bijgesteldeSeconden: 0, lopendSinds: null,
    })).toBe(0)
  })

  it('laat een lopende klok doortellen vanaf lopendSinds', () => {
    const nu = new Date('2026-09-13T12:00:00.000Z')
    const start = new Date('2026-09-13T11:59:00.000Z').toISOString()
    expect(effectieveSeconden(
      { gemetenSeconden: 100, bijgesteldeSeconden: null, lopendSinds: start }, nu,
    )).toBe(160)
  })

  it('telt een gepauzeerde klok niet door', () => {
    expect(effectieveSeconden({
      gemetenSeconden: 900, bijgesteldeSeconden: null, lopendSinds: null,
    })).toBe(900)
  })
})

describe('klokweergave', () => {
  it('laat uren doorlopen voorbij 24', () => {
    expect(secondenNaarKlok(25 * 3600 + 61)).toBe('25:01:01')
  })
  it('vult minuten en seconden aan met een nul', () => {
    expect(secondenNaarKlok(3 * 3600 + 5 * 60 + 4)).toBe('3:05:04')
  })
})

describe('advies uit metingen', () => {
  it('geeft geen instelnorm onder de drie metingen — twee uitschieters zijn geen norm', () => {
    expect(adviesInstelMinuten([11700, 11100])).toBeNull()
  })

  it('rondt de instelnorm af op vijf minuten', () => {
    // 3:15, 3:05, 2:50 → gemiddeld 3:03:20 → 185 min → afgerond 185
    expect(adviesInstelMinuten([11700, 11100, 10200])).toBe(185)
  })

  it('rekent cyclustijd per stuk uit het gedraaide werk', () => {
    expect(adviesCycleMinuten(7200, 5)).toBe(24)
  })

  it('geeft geen cyclusadvies zonder stuks — delen door nul is geen norm', () => {
    expect(adviesCycleMinuten(7200, 0)).toBeNull()
  })
})
