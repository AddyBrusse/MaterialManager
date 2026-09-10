import { describe, it, expect } from 'vitest'
import { naarLijn, samenvatten, euro, asLabel, yDomein } from '../prijshistorie-lijn'
import type { PrijsSnapshot } from '../../../api/prijshistorie'

function snap(p: Partial<PrijsSnapshot>): PrijsSnapshot {
  return {
    id: 's1', artikelId: 'ART-1', bron: 'calculatie', gemetenOp: '2026-01-01T10:00:00.000Z',
    qty: 1, kostprijsPerStuk: 10, verkoopprijsPerStuk: 12.5, margePct: 25,
    kostprijsBasis: 10, verkoopprijsBasis: 12.5,
    kostprijsTotaal: 10, verkoopprijsTotaal: 12.5,
    materiaalPerStuk: 4, instellenPerStuk: 3, bewerkingPerStuk: 3, externPerStuk: 0,
    projectId: null, offerteId: null, offerteRegelId: null, relatieId: null,
    klant: null, door: null, createdAt: '',
    ...p,
  }
}

describe('naarLijn', () => {
  it('zet oud naar nieuw, ook als de server ze anders aanlevert', () => {
    const punten = naarLijn([
      snap({ id: 'b', gemetenOp: '2026-03-01T10:00:00.000Z' }),
      snap({ id: 'a', gemetenOp: '2026-01-01T10:00:00.000Z' }),
    ])
    expect(punten.map((p) => p.datum)).toEqual([
      '2026-01-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z',
    ])
  })

  it('houdt het aantal bij het punt', () => {
    // Zonder aantal is een prijs per stuk niet te lezen: insteltijd wordt over
    // de batch verdeeld.
    const [punt] = naarLijn([snap({ bron: 'order', qty: 5, klant: 'Veratio' })])
    expect(punt).toMatchObject({ qty: 5, klant: 'Veratio', bron: 'order' })
  })

  it('tekent de lijn met de herrekening bij 1, niet met de prijs bij dat aantal', () => {
    // Dit is het punt waar de grafiek anders zou liegen: bij 10 stuks is de
    // kostprijs per stuk laag omdat de insteltijd over de batch gaat, niet
    // omdat het artikel goedkoper geworden is.
    const [punt] = naarLijn([snap({
      bron: 'order', qty: 10,
      kostprijsPerStuk: 25.2, kostprijsBasis: 92.7,
      verkoopprijsPerStuk: 95, verkoopprijsBasis: 115.87,
    })])
    expect(punt.kostprijs).toBe(92.7)
    expect(punt.verkoopprijs).toBe(115.87)
    expect(punt.kostprijsBijAantal).toBe(25.2)
    expect(punt.betaaldPerStuk).toBe(95)
  })
})

describe('samenvatten', () => {
  it('geeft lege waarden zonder punten', () => {
    expect(samenvatten([])).toMatchObject({ laatsteKostprijs: null, aantalOrders: 0, verschilPct: null })
  })

  it('rekent het verschil van eerste naar laatste kostprijs', () => {
    const s = samenvatten(naarLijn([
      snap({ id: 'a', gemetenOp: '2026-01-01T10:00:00.000Z', kostprijsBasis: 10 }),
      snap({ id: 'b', gemetenOp: '2026-06-01T10:00:00.000Z', kostprijsBasis: 12.5 }),
    ]))
    expect(s.verschilPct).toBe(25)
    expect(s.laatsteKostprijs).toBe(12.5)
  })

  it('geeft geen percentage bij één punt', () => {
    expect(samenvatten(naarLijn([snap({})])).verschilPct).toBeNull()
  })

  it('geeft geen percentage als de eerste kostprijs 0 was', () => {
    // Anders deel je door nul en staat er "Infinity%" op het scherm.
    const s = samenvatten(naarLijn([
      snap({ id: 'a', gemetenOp: '2026-01-01T10:00:00.000Z', kostprijsBasis: 0 }),
      snap({ id: 'b', gemetenOp: '2026-02-01T10:00:00.000Z', kostprijsBasis: 8 }),
    ]))
    expect(s.verschilPct).toBeNull()
  })

  it('telt alleen de orders, niet de calculatiepunten', () => {
    const s = samenvatten(naarLijn([
      snap({ id: 'a', gemetenOp: '2026-01-01T10:00:00.000Z', bron: 'calculatie' }),
      snap({ id: 'b', gemetenOp: '2026-02-01T10:00:00.000Z', bron: 'order' }),
      snap({ id: 'c', gemetenOp: '2026-03-01T10:00:00.000Z', bron: 'order' }),
    ]))
    expect(s.aantalOrders).toBe(2)
  })
})

describe('opmaak', () => {
  it('schrijft bedragen op zijn Nederlands', () => {
    expect(euro(1234.5)).toBe('€ 1.234,50')
    expect(euro(null)).toBe('—')
    expect(euro(12, false)).toBe('12,00')
  })

  it('zet maand en jaar op de as', () => {
    expect(asLabel(new Date('2026-03-15T00:00:00Z').getTime())).toMatch(/26/)
  })
})

describe('yDomein', () => {
  it('legt het bereik om de waarden heen en niet vanaf nul', () => {
    // Vanaf nul zou een verloop van € 75 naar € 92 een vlakke streep bovenin zijn.
    const punten = naarLijn([
      snap({ id: 'a', gemetenOp: '2026-01-01T10:00:00.000Z', kostprijsBasis: 75, verkoopprijsBasis: 94 }),
      snap({ id: 'b', gemetenOp: '2026-02-01T10:00:00.000Z', kostprijsBasis: 92, verkoopprijsBasis: 115 }),
    ])
    const [lo, hi] = yDomein(punten)
    expect(lo).toBeGreaterThan(0)
    expect(lo).toBeLessThan(75)
    expect(hi).toBeGreaterThan(115)
  })

  it('houdt een vlakke lijn leesbaar in plaats van hem op de as te plakken', () => {
    const punten = naarLijn([
      snap({ id: 'a', gemetenOp: '2026-01-01T10:00:00.000Z', kostprijsBasis: 50, verkoopprijsBasis: 50 }),
      snap({ id: 'b', gemetenOp: '2026-02-01T10:00:00.000Z', kostprijsBasis: 50, verkoopprijsBasis: 50 }),
    ])
    const [lo, hi] = yDomein(punten)
    expect(lo).toBeLessThan(50)
    expect(hi).toBeGreaterThan(50)
  })
})
