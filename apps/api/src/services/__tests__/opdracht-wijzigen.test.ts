import { describe, it, expect } from 'vitest'
import {
  wijzigOpdracht, waarschuwingBijWijziging,
  type Project, type ProductieOrder, type OfferteRegel, type WijzigContext,
} from '@stockmanager/shared'

const NU = '2026-09-28T10:00:00.000Z'

function regel(id: string, qty: number, prijs = 10): OfferteRegel {
  return { id, sortOrder: 1, artikelId: `ART-${id}`, naam: `Bus ${id}`, omschrijving: '', qty, eenheid: 'st', verkoopprijs: prijs, totaal: qty * prijs, bewerkingen: ['zagen'] }
}

function order(id: string, regelId: string, qty: number, p: Partial<ProductieOrder> = {}): ProductieOrder {
  return {
    id, projectId: 'PRJ', offerteRegelId: regelId, artikelId: null, artikelNaam: '', qty, eenheid: 'st',
    aantalGereed: 0, status: 'gepland', createdAt: NU, updatedAt: NU,
    stappen: [{ id: `${id}-s1`, volgorde: 1, naam: 'zagen', machine: 'zagen', gereedOp: null, gereedDoor: null }],
    ...p,
  }
}

function project(regels: OfferteRegel[], orders: ProductieOrder[]): Project {
  return {
    id: 'PRJ', naam: 'Test', relatieId: null, contactId: null, klantRef: null, status: 'productie',
    statusReden: null, statusVorige: null, levertijdDatum: null, notities: '', offertes: [],
    paklijsten: [], facturen: [], createdAt: NU, updatedAt: NU, productieOrders: orders,
    opdrachtbevestiging: {
      id: 'OB', projectId: 'PRJ', offerteId: 'OFF', regels, levertijdDatum: null, notities: '',
      opdrachtRef: 'x', status: 'verzonden', verzondenOp: NU, verzendingen: [], wijzigingen: [],
      createdAt: NU, updatedAt: NU,
    },
  }
}

let n = 0
const ctx: WijzigContext = {
  nu: NU,
  nieuwRegelId: () => `nieuw-${++n}`,
  nieuweOrder: (r, qty) => order(`NIEUW-${++n}`, r.id, qty),
}

describe('wijzigOpdracht: aantal', () => {
  it('meer: bij de lopende order erbij', () => {
    const uit = wijzigOpdracht(project([regel('r1', 20)], [order('P1', 'r1', 20)]), { soort: 'aantal', regelId: 'r1', qty: 25 }, ctx)
    expect(uit.project.productieOrders.map(o => o.qty)).toEqual([25])
    expect(uit.project.opdrachtbevestiging!.regels[0]).toMatchObject({ qty: 25, totaal: 250 })
    expect(uit.tekst).toBe('"Bus r1": aantal 20 → 25')
  })

  // Een gereedgemelde order openbreken zou zijn afgevinkte stappen weggooien.
  it('meer terwijl alles al gereed is: een nieuwe order voor het verschil', () => {
    const uit = wijzigOpdracht(
      project([regel('r1', 20)], [order('P1', 'r1', 20, { status: 'gereed', aantalGereed: 20 })]),
      { soort: 'aantal', regelId: 'r1', qty: 25 }, ctx,
    )
    expect(uit.project.productieOrders.map(o => [o.status, o.qty])).toEqual([['gereed', 20], ['gepland', 5]])
  })

  it('minder: van het lopende werk af', () => {
    const uit = wijzigOpdracht(project([regel('r1', 20)], [order('P1', 'r1', 20, { aantalGereed: 5 })]), { soort: 'aantal', regelId: 'r1', qty: 10 }, ctx)
    expect(uit.project.productieOrders[0].qty).toBe(10)
  })

  it('minder dan er gemaakt is: de order stopt bij wat er gemaakt is', () => {
    const uit = wijzigOpdracht(
      project([regel('r1', 20)], [order('P1', 'r1', 20, { aantalGereed: 12, status: 'in_productie' })]),
      { soort: 'aantal', regelId: 'r1', qty: 10 }, ctx,
    )
    expect(uit.project.productieOrders[0]).toMatchObject({ qty: 12, status: 'gestopt' })
  })
})

describe('wijzigOpdracht: weg', () => {
  it('zonder voortgang gaat de order mee weg', () => {
    const uit = wijzigOpdracht(project([regel('r1', 20), regel('r2', 5)], [order('P1', 'r1', 20), order('P2', 'r2', 5)]), { soort: 'weg', regelId: 'r1' }, ctx)
    expect(uit.project.opdrachtbevestiging!.regels.map(r => r.id)).toEqual(['r2'])
    expect(uit.project.productieOrders.map(o => o.id)).toEqual(['P2'])
  })

  // Besloten 2026-09-28: gestopt, niet gewist — de gemaakte stuks blijven zichtbaar.
  it('met voortgang wordt de order gestopt, niet gewist', () => {
    const uit = wijzigOpdracht(project([regel('r1', 20)], [order('P1', 'r1', 20, { aantalGereed: 8, status: 'in_productie' })]), { soort: 'weg', regelId: 'r1' }, ctx)
    expect(uit.project.productieOrders[0]).toMatchObject({ id: 'P1', status: 'gestopt', aantalGereed: 8 })
    expect(uit.tekst).toContain('gestopt')
  })
})

describe('wijzigOpdracht: prijs en erbij', () => {
  it('past alleen de opdracht aan, niet de orders', () => {
    const p = project([regel('r1', 20, 46.2)], [order('P1', 'r1', 20)])
    const uit = wijzigOpdracht(p, { soort: 'prijs', regelId: 'r1', verkoopprijs: 44 }, ctx)
    expect(uit.project.opdrachtbevestiging!.regels[0]).toMatchObject({ verkoopprijs: 44, totaal: 880 })
    expect(uit.project.productieOrders).toBe(p.productieOrders)
    expect(uit.tekst).toBe('"Bus r1": prijs € 46,20 → € 44,00')
  })

  it('een regel erbij krijgt meteen een productieorder', () => {
    const { artikelId, naam, omschrijving, qty, eenheid, verkoopprijs, bewerkingen } = regel('x', 4)
    const uit = wijzigOpdracht(project([regel('r1', 20)], []), {
      soort: 'erbij', regels: [{ artikelId, naam, omschrijving, qty, eenheid, verkoopprijs, bewerkingen }],
    }, ctx)
    const nieuw = uit.project.opdrachtbevestiging!.regels[1]
    expect(nieuw).toMatchObject({ sortOrder: 2, qty: 4, totaal: 40 })
    expect(uit.project.productieOrders.map(o => o.offerteRegelId)).toEqual([nieuw.id])
  })
})

describe('waarschuwingBijWijziging', () => {
  it('zegt niets bij een gewone verhoging', () => {
    expect(waarschuwingBijWijziging(project([regel('r1', 20)], [order('P1', 'r1', 20)]), { soort: 'aantal', regelId: 'r1', qty: 25 })).toBeNull()
  })

  it('noemt het overschot als er al meer gemaakt is', () => {
    const w = waarschuwingBijWijziging(
      project([regel('r1', 20)], [order('P1', 'r1', 20, { aantalGereed: 12 })]),
      { soort: 'aantal', regelId: 'r1', qty: 10 },
    )
    expect(w).toContain('Er zijn al 12 van de 20 stuks')
    expect(w).toContain('2 over als overschot')
  })

  it('vraagt altijd bij weghalen, en zegt of de order stopt', () => {
    expect(waarschuwingBijWijziging(project([regel('r1', 20)], [order('P1', 'r1', 20)]), { soort: 'weg', regelId: 'r1' }))
      .toContain('samen met zijn productieorder')
    expect(waarschuwingBijWijziging(project([regel('r1', 20)], [order('P1', 'r1', 20, { aantalGereed: 3 })]), { soort: 'weg', regelId: 'r1' }))
      .toContain('wordt gestopt')
  })
})
