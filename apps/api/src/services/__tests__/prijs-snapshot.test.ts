import { describe, it, expect } from 'vitest'
import { snapshotBijCalculatie, snapshotBijOrder } from '../prijs-snapshot'

// Handgemaakte dubbel in plaats van vi.fn(): een vi.fn() die een afgewezen
// promise teruggeeft laat een losse rejection achter (vitest hangt er zijn
// eigen .then aan), en dat kostte eerder een half uur zoeken.
function nepDb(opties: {
  artikelen?: { id: string; recipe: unknown; estimate: unknown }[]
  vorige?: Record<string, unknown> | null
} = {}) {
  const geschreven: Record<string, unknown>[] = []
  const db = {
    grade: { findMany: async () => [{ id: 'g1', densityKgM3: 7850, pricePerKg: 2 }] },
    profile: { findMany: async () => [{ id: 'p1', volumeFormula: 'round' }] },
    machine: { findMany: async () => [{ id: 'm1', machineRatePerHour: 60, operatorRatePerHour: 0 }] },
    article: { findMany: async () => opties.artikelen ?? [] },
    artikelPrijsSnapshot: {
      findFirst: async () => opties.vorige ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => { geschreven.push(data); return data },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        geschreven.push(...data); return { count: data.length }
      },
    },
  }
  return { db: db as never, geschreven }
}

/** 60 minuten insteltijd à € 60/uur = € 60 per batch, verder niets. */
const setupOnly = {
  recipe: null,
  estimate: {
    marginPct: 25, updatedAt: '',
    nodes: [{ id: 'n1', type: 'machine', name: 'Draaibank', machineId: 'm1', setupMin: 60, steps: [] }],
  },
}

describe('snapshotBijCalculatie', () => {
  it('schrijft een punt bij het aantal 1, met de opbouw erbij', async () => {
    const { db, geschreven } = nepDb()
    await snapshotBijCalculatie(db, 'ART-1', setupOnly, 'u-addy')
    expect(geschreven).toHaveLength(1)
    expect(geschreven[0]).toMatchObject({
      artikelId: 'ART-1', bron: 'calculatie', qty: 1,
      kostprijsPerStuk: 60, verkoopprijsPerStuk: 75, margePct: 25,
      kostprijsBasis: 60, verkoopprijsBasis: 75,
      instellenPerStuk: 60, bewerkingPerStuk: 0, materiaalPerStuk: 0, externPerStuk: 0,
      door: 'u-addy',
    })
  })

  it('slaat zichzelf over als de prijs niet veranderd is', async () => {
    // Anders krijg je een punt bij elke keer opslaan, ook als iemand alleen een
    // notitie aanpaste, en wordt de grafiek een rij identieke stippen.
    const { db, geschreven } = nepDb({ vorige: { kostprijsBasis: 60, verkoopprijsBasis: 75 } })
    await snapshotBijCalculatie(db, 'ART-1', setupOnly, null)
    expect(geschreven).toHaveLength(0)
  })

  it('schrijft wél als alleen de marge veranderde', async () => {
    const { db, geschreven } = nepDb({ vorige: { kostprijsBasis: 60, verkoopprijsBasis: 72 } })
    await snapshotBijCalculatie(db, 'ART-1', setupOnly, null)
    expect(geschreven).toHaveLength(1)
  })

  it('doet niets zonder calculatie', async () => {
    const { db, geschreven } = nepDb()
    await snapshotBijCalculatie(db, 'ART-1', { recipe: null, estimate: null }, null)
    expect(geschreven).toHaveLength(0)
  })
})

describe('snapshotBijOrder', () => {
  const ctx = {
    projectId: 'PRJ-1', offerteId: 'OFF-1',
    relatieId: 'rel-1', klant: 'Veratio', door: 'u-addy',
  }

  it('rekent de kostprijs bij het aantal van de regel, niet bij 1', async () => {
    // Insteltijd geldt per batch: bij 5 stuks is € 60 instellen € 12 per stuk.
    // Zou dit bij 1 berekend worden, dan stond er vijfvoudige insteltijd in de
    // historie en klopte de marge niet meer.
    const { db, geschreven } = nepDb({ artikelen: [{ id: 'ART-1', ...setupOnly }] })
    const aantal = await snapshotBijOrder(db, {
      ...ctx, regels: [{ id: 'r1', artikelId: 'ART-1', qty: 5, verkoopprijs: 20 }],
    })
    expect(aantal).toBe(1)
    expect(geschreven[0]).toMatchObject({
      bron: 'order', qty: 5,
      kostprijsPerStuk: 12, kostprijsTotaal: 60,
      verkoopprijsPerStuk: 20, verkoopprijsTotaal: 100,
      klant: 'Veratio', offerteRegelId: 'r1',
    })
    // …en daarnaast de vergelijkbare maat, herrekend bij 1 stuk: € 60
    // instellen valt dan niet over vijf stuks. Zonder dit zou de grafiek bij
    // elke grote order een duik maken die alleen over de batchgrootte gaat.
    expect(geschreven[0]).toMatchObject({ kostprijsBasis: 60, verkoopprijsBasis: 75 })
  })

  it('neemt de verkoopprijs van de regel over, ook als die afwijkt van de calculatie', async () => {
    // De calculatie zou € 15 zeggen (12 + 25%); wat de klant betaalt is € 20.
    // De historie moet tonen wat er werkelijk verkocht is.
    const { db, geschreven } = nepDb({ artikelen: [{ id: 'ART-1', ...setupOnly }] })
    await snapshotBijOrder(db, { ...ctx, regels: [{ id: 'r1', artikelId: 'ART-1', qty: 5, verkoopprijs: 20 }] })
    expect(geschreven[0].verkoopprijsPerStuk).toBe(20)
    expect(geschreven[0].margePct).toBeCloseTo(66.7, 1)
  })

  it('slaat regels zonder artikel over', async () => {
    const { db, geschreven } = nepDb()
    const aantal = await snapshotBijOrder(db, {
      ...ctx, regels: [{ id: 'r1', artikelId: null, qty: 2, verkoopprijs: 10 }],
    })
    expect(aantal).toBe(0)
    expect(geschreven).toHaveLength(0)
  })

  it('slaat een artikel zonder calculatie over in plaats van kostprijs 0 te noteren', async () => {
    // Een rij met kostprijs 0 zou de grafiek naar beneden trekken alsof het
    // artikel gratis was.
    const { db, geschreven } = nepDb({ artikelen: [{ id: 'ART-1', recipe: null, estimate: null }] })
    const aantal = await snapshotBijOrder(db, {
      ...ctx, regels: [{ id: 'r1', artikelId: 'ART-1', qty: 2, verkoopprijs: 10 }],
    })
    expect(aantal).toBe(0)
    expect(geschreven).toHaveLength(0)
  })
})
