import { describe, it, expect } from 'vitest'
import {
  statusNaLevering, waaromNietPakbon, waaromNietDeelsGereed,
  voorstelPakbon, waaromNietPakbonVersturen, waaromNietPakbonWijzigen,
  type Project, type ProductieOrder, type Paklijst,
} from '@stockmanager/shared'

const NU = '2026-10-02T10:00:00.000Z'

function order(id: string, p: Partial<ProductieOrder> = {}): ProductieOrder {
  return {
    id, projectId: 'PRJ', offerteRegelId: `r-${id}`, artikelId: null, artikelNaam: id, qty: 20, eenheid: 'st',
    aantalGereed: 0, status: 'in_productie', createdAt: NU, updatedAt: NU, stappen: [], ...p,
  }
}

function pakbon(id: string, regels: [string, number][], verzonden: boolean): Paklijst {
  return {
    id, projectId: 'PRJ', notities: '', createdAt: NU, verzondenOp: verzonden ? NU : null,
    regels: regels.map(([r, qty]) => ({ productieOrderId: '', offerteRegelId: r, artikelNaam: r, qty, eenheid: 'st' })),
  }
}

/** Twee regels: Asbus (20) en Pen (5). */
function project(orders: ProductieOrder[], paklijsten: Paklijst[] = [], status: Project['status'] = 'productie'): Project {
  return {
    id: 'PRJ', naam: 'Test', relatieId: null, contactId: null, klantRef: null, status,
    statusReden: null, statusVorige: null, levertijdDatum: null, notities: '', offertes: [],
    paklijsten, facturen: [], createdAt: NU, updatedAt: NU, productieOrders: orders,
    opdrachtbevestiging: {
      regels: [
        { id: 'r-A', naam: 'Asbus', qty: 20, eenheid: 'st', verkoopprijs: 10 },
        { id: 'r-B', naam: 'Pen', qty: 5, eenheid: 'st', verkoopprijs: 2 },
      ],
    } as never,
  }
}

describe('statusNaLevering', () => {
  it('blijft Productie na een deellevering zolang er nog gemaakt moet worden', () => {
    const p = project([order('A', { aantalGereed: 10 }), order('B', { qty: 5 })], [pakbon('PL1', [['r-A', 10]], true)])
    expect(statusNaLevering(p)).toBe('productie')
  })

  it('wordt Gereed voor levering als alles gemaakt is', () => {
    const p = project([order('A', { aantalGereed: 20 }), order('B', { qty: 5, status: 'gereed' })], [pakbon('PL1', [['r-A', 10]], true)])
    expect(statusNaLevering(p)).toBe('paklijst')
  })

  it('wordt pas Geleverd als alles op een verstuurde pakbon staat', () => {
    const orders = [order('A', { aantalGereed: 20 }), order('B', { qty: 5, status: 'gereed' })]
    const onverstuurd = project(orders, [pakbon('PL1', [['r-A', 20], ['r-B', 5]], false)])
    expect(statusNaLevering(onverstuurd)).toBe('paklijst')
    const verstuurd = project(orders, [pakbon('PL1', [['r-A', 20], ['r-B', 5]], true)])
    expect(statusNaLevering(verstuurd)).toBe('verzonden')
  })

  it('raakt statussen buiten de leverfase niet', () => {
    const p = project([order('A', { aantalGereed: 20 })], [], 'on_hold')
    expect(statusNaLevering(p)).toBe('on_hold')
  })

  it('laat een bevestigd project zonder gemaakt stuk bevestigd', () => {
    expect(statusNaLevering(project([order('A', { status: 'gepland' })], [], 'bevestigd'))).toBe('bevestigd')
  })
})

describe('waaromNietPakbon', () => {
  const p = project([order('A', { aantalGereed: 8 }), order('B', { qty: 5, status: 'gereed' })])

  it('laat een deel van een regel en een deel van de regels toe', () => {
    expect(waaromNietPakbon(p, [{ offerteRegelId: 'r-A', qty: 6 }])).toBeNull()
  })

  it('weigert meer dan klaarligt, en zegt wat er eerst moet', () => {
    expect(waaromNietPakbon(p, [{ offerteRegelId: 'r-A', qty: 10 }]))
      .toBe('Asbus: er liggen er maar 8 klaar. Meld eerst 2 st gereed op de Productie-tab.')
  })

  it('weigert een lege pakbon en een aantal van 0', () => {
    expect(waaromNietPakbon(p, [])).toContain('minstens één regel')
    expect(waaromNietPakbon(p, [], { leegMag: true })).toBeNull()
    expect(waaromNietPakbon(p, [{ offerteRegelId: 'r-B', qty: 0 }])).toContain('groter dan 0')
  })

  it('zegt het als er helemaal niets klaarligt', () => {
    expect(waaromNietPakbon(project([order('A')]), [{ offerteRegelId: 'r-A', qty: 1 }])).toContain('niets klaar')
  })
})

describe('waaromNietDeelsGereed', () => {
  const o = order('A', { aantalGereed: 8 })
  it('mag omhoog, niet omlaag, en niet tot het volle aantal', () => {
    expect(waaromNietDeelsGereed(o, 10)).toBeNull()
    expect(waaromNietDeelsGereed(o, 8)).toContain('al 8 gereed')
    expect(waaromNietDeelsGereed(o, 20)).toContain('Gebruik dan "Gereed"')
    expect(waaromNietDeelsGereed(o, 2.5)).toContain('heel aantal')
  })
})

describe('voorstelPakbon', () => {
  it('neemt alleen regels die helemaal klaar zijn', () => {
    // Asbus: 8 van 20 gemaakt → niet voorgesteld. Pen: 5 van 5 → wel.
    const p = project([order('A', { aantalGereed: 8 }), order('B', { qty: 5, status: 'gereed' })])
    expect(voorstelPakbon(p)).toEqual([{ offerteRegelId: 'r-B', qty: 5 }])
  })

  it('neemt de rest van een regel die na een deellevering helemaal klaar is', () => {
    const p = project([order('A', { aantalGereed: 20 })], [pakbon('PL1', [['r-A', 10]], true)])
    expect(voorstelPakbon(p)).toEqual([{ offerteRegelId: 'r-A', qty: 10 }])
  })
})

describe('een concept aanpassen', () => {
  const orders = [order('A', { aantalGereed: 8 })]

  it('telt de eigen stuks van het concept weer als klaar', () => {
    const p = project(orders, [pakbon('PL1', [['r-A', 8]], false)])
    expect(waaromNietPakbon(p, [{ offerteRegelId: 'r-A', qty: 8 }])).toContain('niets klaar')
    expect(waaromNietPakbon(p, [{ offerteRegelId: 'r-A', qty: 8 }], { pakbonId: 'PL1' })).toBeNull()
  })

  it('weigert een regel twee keer', () => {
    const p = project(orders)
    expect(waaromNietPakbon(p, [{ offerteRegelId: 'r-A', qty: 1 }, { offerteRegelId: 'r-A', qty: 1 }])).toContain('twee keer')
  })

  it('laat een verstuurde pakbon niet meer wijzigen, en een lege niet versturen', () => {
    const p = project(orders, [pakbon('PL1', [['r-A', 4]], true), pakbon('PL2', [], false)])
    expect(waaromNietPakbonWijzigen(p, 'PL1')).toContain('al verstuurd')
    expect(waaromNietPakbonWijzigen(p, 'PL2')).toBeNull()
    expect(waaromNietPakbonVersturen(p, 'PL2')).toContain('nog geen regels')
  })
})
