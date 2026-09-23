import { describe, it, expect } from 'vitest'
import type { Offerte, Project, ProductieOrder, ProductieStap } from '@stockmanager/shared'
import { primaireActie, terugActie, stapTelling, ordersGereed, geldendeOfferte } from '../status'

function stap(over: Partial<ProductieStap> = {}): ProductieStap {
  return {
    id: crypto.randomUUID(),
    volgorde: 10,
    naam: 'draaien',
    machine: 'DMG',
    gereedOp: null,
    gereedDoor: null,
    geplandDatum: null,
    geplandMachine: null,
    queuePosition: null,
    notBefore: null,
    ...over,
  }
}

function order(stappen: ProductieStap[], over: Partial<ProductieOrder> = {}): ProductieOrder {
  return {
    id: 'PROD-2026-001',
    projectId: 'PRJ-2026-001',
    offerteRegelId: 'r1',
    artikelId: null,
    artikelNaam: 'Bus',
    qty: 10,
    eenheid: 'st',
    stappen,
    status: 'gepland',
    aantalGereed: 0,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...over,
  }
}

function offerte(over: Partial<Offerte> = {}): Offerte {
  return {
    id: 'OFF-2026-001',
    projectId: 'PRJ-2026-001',
    documentNr: 'OFF-2026-001',
    versie: 1,
    status: 'concept',
    regels: [],
    notities: '',
    geldigTot: null,
    verzondenOp: null,
    geaccepteerdOp: null,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...over,
  }
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'PRJ-2026-001',
    naam: 'Test',
    relatieId: null,
    contactId: null,
    klantRef: null,
    status: 'concept',
    statusReden: null,
    statusVorige: null,
    levertijdDatum: null,
    notities: '',
    offertes: [],
    opdrachtbevestiging: null,
    productieOrders: [],
    paklijsten: [],
    facturen: [],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...over,
  }
}

describe('stapTelling', () => {
  it('telt over alle orders heen', () => {
    const p = project({
      productieOrders: [
        order([stap({ gereedOp: '2026-09-10T10:00:00Z' }), stap()]),
        order([stap(), stap(), stap()], { id: 'PROD-2026-002' }),
      ],
    })
    expect(stapTelling(p.productieOrders)).toEqual({ gereed: 1, totaal: 5 })
  })

  it('telt een order zonder stappen niet als gereed', () => {
    // Anders zou een lege order het project "klaar" maken terwijl er niets
    // gebeurd is — every() op een lege lijst is waar.
    expect(ordersGereed([order([])])).toBe(0)
  })
})

describe('primaireActie', () => {
  it('blokkeert paklijst maken zolang er stappen open staan, met het aantal erbij', () => {
    const p = project({
      status: 'productie',
      productieOrders: [
        order([
          stap({ gereedOp: '2026-09-10T10:00:00Z' }),
          stap(),
          stap(),
        ]),
      ],
    })
    const actie = primaireActie(p)
    expect(actie.label).toBe('Paklijst maken')
    expect(actie.kan).toBe(false)
    expect(actie.reden).toBe('2 van de 3 productiestappen zijn nog niet gereed.')
  })

  it('geeft paklijst maken vrij zodra alles gereed is', () => {
    const p = project({
      status: 'productie',
      productieOrders: [order([stap({ gereedOp: '2026-09-10T10:00:00Z' })])],
    })
    expect(primaireActie(p).kan).toBe(true)
  })

  it('noemt de ontbrekende acceptatie bij het aanmaken van de opdracht', () => {
    const p = project({ status: 'bevestigd' })
    const actie = primaireActie(p)
    expect(actie.label).toBe('Opdracht aanmaken')
    expect(actie.reden).toBe('Er is nog geen offerte geaccepteerd.')
  })

  it('schakelt naar stap afmelden zodra de opdrachtbevestiging bestaat', () => {
    const p = project({
      status: 'bevestigd',
      opdrachtbevestiging: {
        id: 'OB-2026-001',
        projectId: 'PRJ-2026-001',
        offerteId: 'OFF-2026-001',
        regels: [],
        levertijdDatum: null,
        notities: '',
        status: 'verzonden',
        verzondenOp: '2026-09-03T10:00:00Z',
        createdAt: '2026-09-03T10:00:00Z',
        updatedAt: '2026-09-03T10:00:00Z',
      },
      productieOrders: [order([stap()])],
    })
    expect(primaireActie(p).label).toBe('Stap afmelden')
  })

  it('hervat naar de vorige fase, niet naar concept', () => {
    const p = project({ status: 'on_hold', statusVorige: 'productie' })
    expect(primaireActie(p).label).toBe('Project hervatten → Productie')
  })

  it('weigert factureren zolang de paklijst niet verzonden is', () => {
    const p = project({ status: 'verzonden' })
    expect(primaireActie(p).reden).toBe('De paklijst is nog niet verzonden.')
  })
})

describe('terugActie', () => {
  it('blokkeert terug naar concept zodra een offerte geaccepteerd is', () => {
    const p = project({
      status: 'offerte',
      offertes: [offerte({ status: 'geaccepteerd' })],
    })
    const t = terugActie(p)
    expect(t?.naar).toBe('concept')
    expect(t?.blokkades).toHaveLength(1)
  })

  it('noemt de laatste afgevinkte stap met naam en datum', () => {
    const p = project({
      status: 'bevestigd',
      productieOrders: [
        order([
          stap({ naam: 'zagen', gereedOp: '2026-09-10T08:00:00Z', gereedDoor: 'Addy' }),
          stap({ naam: 'frezen', gereedOp: '2026-09-15T08:00:00Z', gereedDoor: 'Bart' }),
        ]),
      ],
    })
    const t = terugActie(p)
    expect(t?.blokkades[0]).toContain('frezen')
    expect(t?.blokkades[0]).toContain('Bart')
    expect(t?.blokkades[0]).toContain('15-09')
  })

  it('draait een verstuurde factuur nooit terug', () => {
    const t = terugActie(project({ status: 'gefactureerd' }))
    expect(t?.blokkades).toHaveLength(1)
    expect(t?.gevolgen[0]).toContain('creditfactuur')
  })

  it('geeft geen terugweg vanuit concept, on hold of geannuleerd', () => {
    expect(terugActie(project({ status: 'concept' }))).toBeNull()
    expect(terugActie(project({ status: 'on_hold' }))).toBeNull()
    expect(terugActie(project({ status: 'geannuleerd' }))).toBeNull()
  })
})

describe('geldendeOfferte', () => {
  it('kiest de geaccepteerde versie, niet de hoogste', () => {
    const p = project({
      offertes: [
        offerte({ id: 'OFF-1', versie: 1, status: 'geaccepteerd' }),
        offerte({ id: 'OFF-2', versie: 2, status: 'concept' }),
      ],
    })
    expect(geldendeOfferte(p)?.id).toBe('OFF-1')
  })

  it('valt terug op de hoogste versie als er niets geaccepteerd is', () => {
    const p = project({
      offertes: [
        offerte({ id: 'OFF-1', versie: 1 }),
        offerte({ id: 'OFF-2', versie: 2 }),
      ],
    })
    expect(geldendeOfferte(p)?.id).toBe('OFF-2')
  })
})
