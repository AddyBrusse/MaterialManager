import { describe, it, expect } from 'vitest'
import {
  vrijgeven, terugNaarVoorbereiding, waaromNietVrijgeven, waaromNietTerugNaarVoorbereiding,
  waarschuwingenBijVrijgeven, orderStatusNaStappen, isVrijgegeven,
  type Project, type ProductieOrder,
} from '@stockmanager/shared'

const NU = '2026-09-30T10:00:00.000Z'

function order(id: string, p: Partial<ProductieOrder> = {}): ProductieOrder {
  return {
    id, projectId: 'PRJ', offerteRegelId: `r-${id}`, artikelId: null, artikelNaam: '', qty: 10, eenheid: 'st',
    aantalGereed: 0, status: 'voorbereiding', createdAt: NU, updatedAt: NU,
    stappen: [{ id: `${id}-s1`, volgorde: 1, naam: 'zagen', machine: 'zagen', gereedOp: null, gereedDoor: null }],
    ...p,
  }
}

function project(orders: ProductieOrder[], over: Partial<Project> = {}): Project {
  return {
    id: 'PRJ', naam: 'Test', relatieId: null, contactId: null, klantRef: null, status: 'bevestigd',
    statusReden: null, statusVorige: null, levertijdDatum: null, notities: '', offertes: [],
    paklijsten: [], facturen: [], createdAt: NU, updatedAt: NU, productieOrders: orders,
    opdrachtbevestiging: null,
    ...over,
  }
}

describe('vrijgeven', () => {
  it('zet alleen de gekozen orders in de hal, en het project naar Productie', () => {
    const uit = vrijgeven(project([order('P1'), order('P2')]), ['P1'], NU)
    expect(uit.productieOrders.map(o => o.status)).toEqual(['gepland', 'voorbereiding'])
    expect(uit.status).toBe('productie')
  })

  it('weigert niets gekozen, of een order die al vrij is', () => {
    const p = project([order('P1', { status: 'gepland' })])
    expect(waaromNietVrijgeven(p, [])).toContain('Vink eerst aan')
    expect(waaromNietVrijgeven(p, ['P1'])).toContain('al vrijgegeven')
    expect(waaromNietVrijgeven(p, ['P9'])).toContain('bestaat niet')
  })

  // Besloten 2026-09-30: waarschuwen, niet blokkeren.
  it('waarschuwt voor een niet verstuurde opdracht en ontbrekend materiaal', () => {
    const w = waarschuwingenBijVrijgeven(project([order('P1')]), ['Bus 1', 'Flens'])
    expect(w).toEqual([
      'De opdrachtbevestiging is nog niet naar de klant verstuurd.',
      'Voor "Bus 1", "Flens" is nog geen materiaal gekozen.',
    ])
  })
})

describe('terugNaarVoorbereiding', () => {
  it('haalt een order zonder voortgang uit de hal; niets meer vrij → Bevestigd', () => {
    const p = project([order('P1', { status: 'gepland' })], { status: 'productie' })
    expect(waaromNietTerugNaarVoorbereiding(p, ['P1'])).toBeNull()
    const uit = terugNaarVoorbereiding(p, ['P1'], NU)
    expect(uit.productieOrders[0].status).toBe('voorbereiding')
    expect(uit.status).toBe('bevestigd')
  })

  it('blijft in Productie als er nog een andere order vrij is', () => {
    const p = project([order('P1', { status: 'gepland' }), order('P2', { status: 'gepland' })], { status: 'productie' })
    expect(terugNaarVoorbereiding(p, ['P1'], NU).status).toBe('productie')
  })

  it('weigert als er al aan gewerkt is — dat werk mag niet stil verdwijnen', () => {
    const p = project([order('P1', { status: 'in_productie', aantalGereed: 3 })], { status: 'productie' })
    expect(waaromNietTerugNaarVoorbereiding(p, ['P1'])).toContain('al gewerkt')
  })
})

describe('orderStatusNaStappen', () => {
  const o = order('P1')
  it('blijft in voorbereiding zolang er niets is afgevinkt', () => {
    expect(orderStatusNaStappen(o, o.stappen)).toBe('voorbereiding')
    expect(isVrijgegeven(o)).toBe(false)
  })
  it('afvinken op een order in voorbereiding geeft hem vrij', () => {
    const stappen = o.stappen.map(s => ({ ...s, gereedOp: NU }))
    expect(orderStatusNaStappen(o, stappen)).toBe('gereed')
  })
  it('een gestopte order blijft gestopt', () => {
    expect(orderStatusNaStappen({ ...o, status: 'gestopt' }, o.stappen)).toBe('gestopt')
  })
})
