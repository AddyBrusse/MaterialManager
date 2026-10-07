import { describe, it, expect } from 'vitest'
import type { Offerte, Project, ProductieOrder, ProductieStap } from '@stockmanager/shared'
import { berekenVoortgang } from '@stockmanager/shared'
import { terugActie, stapTelling, ordersGereed, geldendeOfferte, teAccepteren, productieAf } from '../status'
import { tabActie } from '../tab-actie'
import type { TabId } from '../../types'

/** De echte rekenkern erbij, zodat de test niet met een verzonnen voortgang
 *  test wat het scherm met de echte doet. */
const actie = (p: Project, tab: TabId = 'productie', open: string | null = null, gekozenOrders: string[] = []) =>
  tabActie(p, berekenVoortgang(p), tab, { openVersie: open, gekozenOrders, regelsZonderMateriaal: [] })!

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
    externeRef: null, direct: false, vervallenDoor: null,
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

describe('tabActie: Productie', () => {
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
    const uit = actie(p)
    expect(uit.label).toBe('Naar pakbonnen')
    expect(uit.kan).toBe(false)
    expect(uit.reden).toBe('2 van de 3 productiestappen zijn nog niet gereed.')
  })

  it('geeft paklijst maken vrij zodra er stuks klaarliggen, niet pas als alles af is', () => {
    // De kern van deelleveringen: 6 van de 10 klaar is genoeg voor een pakbon.
    const p = project({
      status: 'productie',
      offertes: [
        offerte({
          status: 'geaccepteerd',
          regels: [
            {
              id: 'r1',
              sortOrder: 1,
              artikelId: null,
              naam: 'Bus',
              omschrijving: '',
              qty: 10,
              eenheid: 'st',
              verkoopprijs: 10,
              totaal: 100,
              bewerkingen: [],
            },
          ],
        }),
      ],
      productieOrders: [order([stap()], { qty: 10, aantalGereed: 6 })],
    })
    const uit = actie(p)
    expect(uit.kan).toBe(true)
    expect(uit.label).toContain('6 klaar')
  })

  it('blokkeert de paklijst zolang er niets klaarligt, met het aantal erbij', () => {
    const p = project({
      status: 'productie',
      offertes: [
        offerte({
          status: 'geaccepteerd',
          regels: [
            {
              id: 'r1',
              sortOrder: 1,
              artikelId: null,
              naam: 'Bus',
              omschrijving: '',
              qty: 10,
              eenheid: 'st',
              verkoopprijs: 10,
              totaal: 100,
              bewerkingen: [],
            },
          ],
        }),
      ],
      productieOrders: [order([stap()], { qty: 10, aantalGereed: 0 })],
    })
    const uit = actie(p)
    expect(uit.kan).toBe(false)
    expect(uit.reden).toBe('Er ligt nog niets klaar om te leveren — 10 nog te maken.')
  })

  it('hervat naar de vorige fase, niet naar concept', () => {
    const p = project({ status: 'on_hold', statusVorige: 'productie' })
    expect(actie(p).label).toBe('Project hervatten → Productie')
    // Op elke tab, ook zonder eigen document: het project staat stil.
    expect(actie(p, 'algemeen').stap).toEqual({ soort: 'hervatten' })
  })

  it('verstuurt eerst de open paklijst voordat er gefactureerd wordt', () => {
    const p = project({
      status: 'paklijst',
      paklijsten: [{ id: 'PL-1', projectId: 'PRJ-2026-001', regels: [], notities: '', verzondenOp: null, createdAt: '2026-09-10T10:00:00Z' }],
    })
    expect(actie(p, 'documenten')).toMatchObject({ label: 'Pakbon PL-1 versturen', stap: { soort: 'paklijst-versturen', paklijstId: 'PL-1' } })
  })
})

describe('terugActie', () => {
  // Sinds deelleveringen (2026-10-02) kan een open pakbon ook midden in de productie liggen.
  it('trekt eerst een niet verstuurde pakbon in, ook in Productie', () => {
    const t = terugActie(project({
      status: 'productie',
      paklijsten: [{ id: 'PL-1', projectId: 'PRJ-2026-001', regels: [], notities: '', verzondenOp: null, createdAt: '2026-09-10T10:00:00Z' }],
    }))
    expect(t).toMatchObject({ label: 'Pakbon PL-1 intrekken', blokkades: [] })
  })

  it('zegt bij Gereed voor levering zonder pakbon dat het via de Productie-tab terug moet', () => {
    const t = terugActie(project({ status: 'paklijst', paklijsten: [] }))
    expect(t?.blokkades[0]).toContain('Productie-tab')
  })

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

// 2026-09-30: "Offerte accepteren" in de footer bracht je alleen naar de
// Offertes-tab; stond je daar al, dan gebeurde er niets.
describe('teAccepteren: welke versie de footerknop accepteert', () => {
  const v1 = offerte({ id: 'OFF-1', versie: 1, status: 'verzonden' })
  const v2 = offerte({ id: 'OFF-2', versie: 2, status: 'verzonden' })
  const v3 = offerte({ id: 'OFF-3', versie: 3, status: 'concept' })

  it('de enige verstuurde versie, ook als er een concept open staat', () => {
    const p = project({ status: 'offerte', offertes: [v1, v3] })
    expect(teAccepteren(p, 'OFF-3').offerte?.id).toBe('OFF-1')
    // Op de lege Opdracht-tab; op de Offertes-tab gaat de knop over het open concept.
    expect(actie(p, 'opdracht', 'OFF-3')).toMatchObject({ label: 'Offerte v1 accepteren', kan: true })
  })

  it('bij meerdere verstuurde versies de opengeklapte', () => {
    const p = project({ status: 'offerte', offertes: [v1, v2, v3] })
    expect(teAccepteren(p, 'OFF-1').offerte?.id).toBe('OFF-1')
    expect(actie(p, 'offertes', 'OFF-2').label).toBe('Offerte v2 accepteren')
  })

  it('verzint er geen als er geen verstuurde versie open staat, en zegt wat er moet', () => {
    const p = project({ status: 'offerte', offertes: [v1, v2] })
    const uit = actie(p, 'offertes', null)
    expect(uit).toMatchObject({ label: 'Offerte accepteren', kan: false })
    expect(uit.reden).toContain('2 verstuurde versies (v1, v2)')
    expect(uit.reden).toContain('klap')
    expect(teAccepteren(p, null).offerte).toBeUndefined()
  })

  it('zonder verstuurde versie: niets te accepteren', () => {
    expect(teAccepteren(project({ status: 'offerte', offertes: [v3] }), 'OFF-3').reden).toBe('Er is nog geen offerte verstuurd.')
  })
})

// Besloten 2026-09-30: de knop hoort bij de tab, niet bij de fase van het project.
describe('tabActie: per tab een eigen knop', () => {
  const regel = {
    id: 'r1', sortOrder: 1, artikelId: null, naam: 'Bus', omschrijving: '',
    qty: 10, eenheid: 'st', verkoopprijs: 10, totaal: 100, bewerkingen: [],
  }
  const ob = (over: Partial<NonNullable<Project['opdrachtbevestiging']>> = {}) => ({
    id: 'OB-1', projectId: 'PRJ-2026-001', offerteId: 'OFF-1', regels: [regel],
    levertijdDatum: null, notities: '', opdrachtRef: 'INK-1', status: 'concept' as const,
    verzondenOp: null, verzendingen: [], wijzigingen: [],
    createdAt: '2026-09-03T10:00:00Z', updatedAt: '2026-09-03T10:00:00Z',
    ...over,
  })
  const geaccepteerd = offerte({ id: 'OFF-1', status: 'geaccepteerd', regels: [regel] })

  it('Offertes: maken, dan de open concept-versie versturen', () => {
    expect(actie(project(), 'offertes')).toMatchObject({ label: 'Offerte maken', stap: { soort: 'offerte-maken' } })
    const p = project({ offertes: [offerte({ id: 'OFF-1', regels: [regel] })] })
    expect(actie(p, 'offertes', 'OFF-1')).toMatchObject({ label: 'Offerte v1 versturen', stap: { soort: 'offerte-versturen', offerteId: 'OFF-1' } })
  })

  it('Offertes: een lege versie kan niet de deur uit, en zegt waarom', () => {
    const uit = actie(project({ offertes: [offerte()] }), 'offertes', 'OFF-2026-001')
    expect(uit).toMatchObject({ kan: false, stap: null })
    expect(uit.reden).toContain('nog geen regels')
  })

  it('Offertes: na accepteren door naar de opdracht, ook als het project al verder is', () => {
    const p = project({ status: 'productie', offertes: [geaccepteerd] })
    expect(actie(p, 'offertes')).toMatchObject({ label: 'Naar opdracht', stap: { soort: 'naar', tab: 'opdracht' } })
  })

  it('Opdracht: versturen, en daarna door naar productie', () => {
    const p = project({ status: 'bevestigd', offertes: [geaccepteerd], opdrachtbevestiging: ob() })
    expect(actie(p, 'opdracht')).toMatchObject({ label: 'Opdracht versturen', stap: { soort: 'opdracht-versturen' } })
    const inhoud = { levertijd: null, opdrachtRef: 'INK-1', notities: '', regels: [{ id: 'r1', naam: 'Bus', qty: 10, verkoopprijs: 10 }] }
    const verzonden = ob({ status: 'verzonden', verzondenOp: '2026-09-04T10:00:00Z', verzendingen: [{ op: '2026-09-04T10:00:00Z', door: 'Addy', naar: null, inhoud }] })
    expect(actie({ ...p, opdrachtbevestiging: verzonden }, 'opdracht')).toMatchObject({ label: 'Naar productie', stap: { soort: 'naar', tab: 'productie' } })
  })

  it('Opdracht: gewijzigd na versturen → opnieuw versturen', () => {
    const inhoud = { levertijd: null, opdrachtRef: 'INK-1', notities: '', regels: [{ id: 'r1', naam: 'Bus', qty: 8, verkoopprijs: 10 }] }
    const p = project({
      status: 'bevestigd', offertes: [geaccepteerd],
      opdrachtbevestiging: ob({ status: 'verzonden', verzondenOp: '2026-09-04T10:00:00Z', verzendingen: [{ op: '2026-09-04T10:00:00Z', door: 'Addy', naar: null, inhoud }] }),
    })
    expect(actie(p, 'opdracht')).toMatchObject({ label: 'Opdracht opnieuw versturen', stap: { soort: 'opdracht-versturen' } })
  })

  it('tabs zonder eigen document hebben geen knop', () => {
    const p = project({ status: 'productie', offertes: [geaccepteerd] })
    for (const tab of ['algemeen', 'nacalculatie'] as const) {
      expect(tabActie(p, berekenVoortgang(p), tab, { openVersie: null, gekozenOrders: [], regelsZonderMateriaal: [] })).toBeNull()
    }
  })
})

describe('productieAf', () => {
  it('telt een gereedgemelde order als af, ook als zijn stap niet is afgevinkt', () => {
    expect(productieAf([order([stap()], { status: 'gereed', aantalGereed: 10 })])).toBe(true)
    expect(productieAf([order([stap()])])).toBe(false)
    expect(productieAf([])).toBe(false)
  })
})

// 2026-09-30: orders beginnen in voorbereiding; kantoor geeft ze vrij.
describe('tabActie: vrijgeven', () => {
  const vb = (id: string, over: Partial<ProductieOrder> = {}) => order([stap()], { id, status: 'voorbereiding', offerteRegelId: `r-${id}`, artikelNaam: `Art ${id}`, ...over })

  it('telt de aangevinkte orders in het label, en biedt "Alles vrijgeven" onder het pijltje', () => {
    const p = project({ status: 'bevestigd', productieOrders: [vb('P1'), vb('P2'), vb('P3')] })
    const uit = actie(p, 'productie', null, ['P1', 'P3'])
    expect(uit).toMatchObject({ label: '2/3 vrijgeven', kan: true, stap: { soort: 'vrijgeven', orderIds: ['P1', 'P3'] } })
    expect(uit.menu?.[0]).toMatchObject({ label: 'Alles vrijgeven', stap: { orderIds: ['P1', 'P2', 'P3'] } })
  })

  it('niets aangevinkt: knop uit met de reden, het pijltje blijft', () => {
    const uit = actie(project({ status: 'bevestigd', productieOrders: [vb('P1')] }), 'productie', null, [])
    expect(uit).toMatchObject({ label: '0/1 vrijgeven', kan: false, reden: 'Vink aan welke orders in productie mogen.' })
    expect(uit.menu).toHaveLength(1)
  })

  it('geeft de waarschuwingen mee: opdracht niet verstuurd, materiaal niet gekozen', () => {
    const p = project({ status: 'bevestigd', productieOrders: [vb('P1'), vb('P2')] })
    const uit = tabActie(p, berekenVoortgang(p), 'productie', { openVersie: null, gekozenOrders: ['P1', 'P2'], regelsZonderMateriaal: ['r-P2'] })!
    expect(uit.stap).toMatchObject({
      soort: 'vrijgeven',
      waarschuwingen: ['De opdrachtbevestiging is nog niet naar de klant verstuurd.', 'Voor "Art P2" is nog geen materiaal gekozen.'],
    })
  })

  it('Opdracht-tab: na versturen "In productie geven" zolang er iets in voorbereiding staat', () => {
    const inhoud = { levertijd: null, opdrachtRef: null, notities: '', regels: [] }
    const p = project({
      status: 'bevestigd',
      productieOrders: [vb('P1')],
      opdrachtbevestiging: {
        id: 'OB-1', projectId: 'PRJ-2026-001', offerteId: 'OFF-1', regels: [], levertijdDatum: null, notities: '',
        opdrachtRef: null, status: 'verzonden', verzondenOp: '2026-09-04T10:00:00Z',
        verzendingen: [{ op: '2026-09-04T10:00:00Z', door: 'Addy', naar: null, inhoud }], wijzigingen: [],
        createdAt: '2026-09-03T10:00:00Z', updatedAt: '2026-09-03T10:00:00Z',
      },
    })
    expect(actie(p, 'opdracht')).toMatchObject({ label: 'In productie geven', stap: { soort: 'naar', tab: 'productie' } })
  })
})
