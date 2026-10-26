import { describe, it, expect } from 'vitest'
import { dekkingPerRegel, nogTeKiezen, regelVan, voorraadRegels, type EstimateNode } from '@stockmanager/shared'
import { materiaalWerkelijk } from '../nacalculatie'

const mat = (id: string, p: Partial<EstimateNode> = {}): EstimateNode => ({ id, type: 'material', name: id, gradeId: 'g1', ...p })

describe('voorraadRegels', () => {
  it('neemt elke materiaalregel met een kwaliteit, behalve exoten, in de volgorde van het recept', () => {
    const nodes: EstimateNode[] = [
      mat('as'), { id: 'm', type: 'machine', name: 'Doosan' }, mat('exoot', { exoot: true }), mat('leeg', { gradeId: null }), mat('bus'),
    ]
    expect(voorraadRegels({ nodes }).map((n) => n.id)).toEqual(['as', 'bus'])
  })
  it('zonder calculatie: niets', () => {
    expect(voorraadRegels(null)).toEqual([])
  })
})

describe('regelVan', () => {
  it('een reservering van vóór 2026-10-23 (zonder regel) hoort bij de eerste regel', () => {
    expect(regelVan(null, ['as', 'bus'])).toBe('as')
    expect(regelVan(undefined, ['as', 'bus'])).toBe('as')
  })
  it('een regel die niet meer in het recept staat hoort nergens bij', () => {
    expect(regelVan('weg', ['as', 'bus'])).toBeUndefined()
  })
  it('een artikel met alleen het oude recept heeft één regel zonder id', () => {
    expect(regelVan(null, [null])).toBeNull()
  })
})

describe('dekkingPerRegel', () => {
  it('telt per regel de stuks die vastliggen, ook afgeboekt, maar niet geannuleerd', () => {
    const d = dekkingPerRegel(['as', 'bus'], 50, [
      { materiaalRegelId: 'as', pieces: 30, status: 'open' },
      { materiaalRegelId: 'as', pieces: 20, status: 'done' },
      { materiaalRegelId: 'bus', pieces: 50, status: 'geannuleerd' },
    ], [])
    expect(d.map((x) => [x.regelId, x.gedektStuks, x.klaar])).toEqual([['as', 50, true], ['bus', 0, false]])
    expect(nogTeKiezen(d[1])).toBe(50)
  })

  it('een open tekort-bestelregel maakt de regel klaar; een ontvangen niet meer', () => {
    const open = dekkingPerRegel(['as', 'bus'], 50, [{ materiaalRegelId: 'bus', pieces: 20, status: 'open' }], [{ materiaalRegelId: 'bus', status: 'besteld' }])
    expect(open[1]).toMatchObject({ gedektStuks: 20, besteld: true, klaar: true })
    expect(nogTeKiezen(open[1])).toBe(0)
    const binnen = dekkingPerRegel(['as', 'bus'], 50, [{ materiaalRegelId: 'bus', pieces: 20, status: 'open' }], [{ materiaalRegelId: 'bus', status: 'ontvangen' }])
    expect(binnen[1]).toMatchObject({ besteld: false, klaar: false })
    expect(nogTeKiezen(binnen[1])).toBe(30)
  })

  it('oude reserveringen en tekorten zonder regel tellen voor de eerste regel', () => {
    const d = dekkingPerRegel(['as', 'bus'], 10, [{ materiaalRegelId: null, pieces: 10, status: 'open' }], [{ materiaalRegelId: null, status: 'te_bestellen' }])
    expect(d[0]).toMatchObject({ gedektStuks: 10, besteld: true })
    expect(d[1]).toMatchObject({ gedektStuks: 0, besteld: false, klaar: false })
  })

  it('een hoger aantal na het kiezen: wat vastligt blijft gedekt, de rest is weer te kiezen', () => {
    const [d] = dekkingPerRegel(['as'], 60, [{ materiaalRegelId: 'as', pieces: 50, status: 'open' }], [])
    expect(d.klaar).toBe(false)
    expect(nogTeKiezen(d)).toBe(10)
  })
})

/** Net genoeg db voor `materiaalWerkelijk`. */
function nepDb(bonnen: Record<string, unknown>[], staven: Record<string, unknown>[]) {
  const grades = [{ id: 'g1', name: 'C45', densityKgM3: 7850, pricePerKg: 2 }]
  return {
    zaagReservering: { findMany: async () => bonnen },
    rawMaterial: { findMany: async () => staven },
    grade: { findMany: async () => grades },
  } as never
}

describe('materiaalWerkelijk', () => {
  const rond50 = { id: 's1', dimensions: { diameter: 50 }, grade: { densityKgM3: 7850, pricePerKg: 2 }, profile: { volumeFormula: 'round' } }
  // Ø50 × 1000 mm = π·25²·1000 mm³ = 1,9635 dm³ → 15,41 kg → € 30,83.
  const perMeter = Math.PI * 25 * 25 * 1000 * 1e-9 * 7850 * 2

  it('rekent met wat er volgens de bon af ging, niet met de hele staaf', async () => {
    const db = nepDb([{ barId: 's1', sawLength: 300, fysiekeLengte: 3000, materiaal: 'C45', diameter: 50 }], [rond50])
    expect(await materiaalWerkelijk(db, {})).toBeCloseTo(perMeter * 0.3, 6)
  })

  it('rekent met de vorm en maat van de staaf: een vierkant is geen rond', async () => {
    const vierkant = { id: 's2', dimensions: { side: 40 }, grade: rond50.grade, profile: { volumeFormula: 'square' } }
    const db = nepDb([{ barId: 's2', sawLength: 1000, fysiekeLengte: 1000, materiaal: 'C45', diameter: 0 }], [vierkant])
    expect(await materiaalWerkelijk(db, {})).toBeCloseTo(40 * 40 * 1000 * 1e-9 * 7850 * 2, 6)
  })

  it('is de staaf weg, dan wat de bon weet: kwaliteit bij naam, rond met de diameter', async () => {
    const db = nepDb([{ barId: 'weg', sawLength: 1000, fysiekeLengte: 3000, materiaal: 'C45', diameter: 50 }], [])
    expect(await materiaalWerkelijk(db, {})).toBeCloseTo(perMeter, 6)
  })

  it('niets afgeboekt: null, geen nul', async () => {
    expect(await materiaalWerkelijk(nepDb([], []), {})).toBeNull()
  })
})
