import { describe, expect, it } from 'vitest'
import type { Factuur, Offerte, Paklijst, Project, ProductieOrder } from '@stockmanager/shared'
import { signalenVan, stappenVan, heeftSignaal } from '../overzicht/signalen'
import { snelleFilters } from '../overzicht/snelle-filters'
import { filterLabel, past, voegToe, wisselSignaal, type FilterCtx } from '../overzicht/filters'

const NU = new Date('2026-10-05T12:00:00')

const regel = { id: 'r1', sortOrder: 0, artikelId: null, naam: 'Bus', omschrijving: '', qty: 10, eenheid: 'st', verkoopprijs: 10, totaal: 100 }

function offerte(deel: Partial<Offerte> = {}): Offerte {
  return {
    id: 'OFF-1', documentNr: 'OFF-1', projectId: 'P', versie: 1, status: 'verzonden', regels: [regel], notities: '',
    externeRef: null, direct: false, vervallenDoor: null, geldigTot: null, verzondenOp: '2026-09-01T10:00:00Z',
    geaccepteerdOp: null, createdAt: '2026-09-01T09:00:00Z', updatedAt: '2026-09-01T09:00:00Z', ...deel,
  } as Offerte
}

function project(deel: Partial<Project> = {}): Project {
  return {
    id: 'P', naam: 'Test', relatieId: 'R1', contactId: null, klantRef: null, status: 'offerte', statusReden: null,
    statusVorige: null, levertijdDatum: null, notities: '', offertes: [offerte()], opdrachtbevestiging: null,
    productieOrders: [], paklijsten: [], facturen: [], createdAt: '2026-09-01T09:00:00Z', updatedAt: '2026-09-01T09:00:00Z',
    ...deel,
  } as Project
}

const geaccepteerd = (extra: Partial<Project> = {}) =>
  project({ status: 'productie', offertes: [offerte({ status: 'geaccepteerd', geaccepteerdOp: '2026-09-02T09:00:00Z' })], ...extra })

const order = (deel: Partial<ProductieOrder> = {}) =>
  ({ id: 'PO1', offerteRegelId: 'r1', artikelId: null, artikelNaam: 'Bus', qty: 10, eenheid: 'st', status: 'gereed', aantalGereed: 10, stappen: [], ...deel }) as unknown as ProductieOrder

const pakbon = (qty: number, verzonden: string | null, id = 'PL1'): Paklijst =>
  ({ id, projectId: 'P', regels: [{ productieOrderId: 'PO1', offerteRegelId: 'r1', artikelNaam: 'Bus', qty, eenheid: 'st' }], notities: '', verzondenOp: verzonden, createdAt: '2026-09-20T09:00:00Z' })

const factuur = (deel: Partial<Factuur> = {}): Factuur =>
  ({ id: 'F1', soort: 'factuur', crediteertFactuurId: null, projectId: 'P', offerteId: 'OFF-1',
    regels: [{ offerteRegelId: 'r1', naam: 'Bus', qty: 10, eenheid: 'st', verkoopprijs: 10, totaal: 100 }],
    btwPct: 21, subtotaal: 100, btwBedrag: 21, totaalInclBtw: 121, notities: '', vervaldatum: '2026-10-01',
    verzondenOp: '2026-09-17T09:00:00Z', naarEmail: null, betaaldOp: null, createdAt: '2026-09-17T09:00:00Z', ...deel }) as Factuur

describe('signalen', () => {
  it('geen reactie: verstuurd langer dan de drempel, niet daarvoor', () => {
    expect(signalenVan(project(), NU, 21).geenReactie).toBe(true) // 34 dagen
    expect(signalenVan(project(), NU, 40).geenReactie).toBe(false)
    expect(signalenVan(project({ offertes: [offerte({ verzondenOp: '2026-09-28T10:00:00Z' })] }), NU, 21).geenReactie).toBe(false)
  })

  it('geen reactie telt niet meer zodra er een opdracht is of het project geannuleerd is', () => {
    expect(signalenVan(geaccepteerd(), NU, 21).geenReactie).toBe(false)
    expect(signalenVan(project({ status: 'geannuleerd' }), NU, 21).geenReactie).toBe(false)
  })

  it('over levertijd alleen als er nog iets geleverd moet worden', () => {
    const laat = geaccepteerd({ levertijdDatum: '2026-10-01', productieOrders: [order()] })
    expect(signalenVan(laat, NU, 21).overLevertijd).toBe(true)
    const geleverd = { ...laat, paklijsten: [pakbon(10, '2026-10-02T09:00:00Z')] }
    expect(signalenVan(geleverd, NU, 21).overLevertijd).toBe(false)
  })

  it('te leveren, te factureren en openstaand uit de voortgang en de facturen', () => {
    const p = geaccepteerd({ productieOrders: [order()], paklijsten: [pakbon(4, '2026-09-20T09:00:00Z')] })
    const s = signalenVan(p, NU, 21)
    expect(s.teLeveren).toBe(6)
    expect(s.teFactureren).toBe(40)
    const metFactuur = { ...p, facturen: [factuur({ regels: [{ offerteRegelId: 'r1', naam: 'Bus', qty: 4, eenheid: 'st', verkoopprijs: 10, totaal: 40 }], subtotaal: 40, btwBedrag: 8.4, totaalInclBtw: 48.4 })] }
    const t = signalenVan(metFactuur, NU, 21)
    expect(t.teFactureren).toBe(0)
    expect(t.openstaand).toBe(48.4)
    expect(t.vervallen).toBe(1)
    expect(heeftSignaal(t, 'vervallen')).toBe(true)
  })
})

describe('stappen', () => {
  it('deellevering is "deels", alles gefactureerd maar onbetaald is nog niet klaar', () => {
    const p = geaccepteerd({
      productieOrders: [order()],
      paklijsten: [pakbon(10, '2026-09-20T09:00:00Z')],
      facturen: [factuur()],
    })
    expect(stappenVan(p).map((s) => s.toestand)).toEqual(['klaar', 'klaar', 'klaar', 'deels'])
    const betaald = { ...p, facturen: [factuur({ betaaldOp: '2026-10-02' })] }
    expect(stappenVan(betaald).map((s) => s.toestand)).toEqual(['klaar', 'klaar', 'klaar', 'klaar'])
    const half = geaccepteerd({ productieOrders: [order()], paklijsten: [pakbon(4, '2026-09-20T09:00:00Z')] })
    expect(stappenVan(half)[2].toestand).toBe('deels')
  })
})

describe('filters', () => {
  const ctx: FilterCtx = {
    nu: NU,
    signalen: (p) => signalenVan(p, NU, 21),
    bedrag: () => 100,
    klantNaam: (id) => (id === 'R1' ? 'VL Machinebouw' : ''),
    contactNaam: () => '',
  }

  it('een tegel zet zijn filter aan en weer uit', () => {
    const aan = wisselSignaal([], 'teFactureren')
    expect(aan).toEqual([{ soort: 'signaal', signaal: 'teFactureren' }])
    expect(wisselSignaal(aan, 'teFactureren')).toEqual([])
  })

  it('levertijd, offerteleeftijd en bedrag', () => {
    const p = project({ levertijdDatum: '2026-10-09' })
    expect(past(p, { soort: 'levertijd', periode: 'week' }, ctx)).toBe(true)
    expect(past(p, { soort: 'levertijd', periode: 'voorbij' }, ctx)).toBe(false)
    expect(past(p, { soort: 'offerteLeeftijd', dagen: 30 }, ctx)).toBe(true)
    expect(past(p, { soort: 'offerteLeeftijd', dagen: 40 }, ctx)).toBe(false)
    expect(past(p, { soort: 'bedrag', min: 50, max: 150 }, ctx)).toBe(true)
    expect(past(p, { soort: 'bedrag', min: 150 }, ctx)).toBe(false)
  })

  it('chips lezen als een zin', () => {
    expect(filterLabel({ soort: 'klant', relatieId: 'R1' }, ctx)).toBe('Klant: VL Machinebouw')
    expect(filterLabel({ soort: 'signaal', signaal: 'geenReactie' }, ctx)).toBe('Geen reactie op offerte')
    expect(filterLabel({ soort: 'levertijd', periode: 'tussen', van: '2026-10-01', tot: '2026-10-31' }, ctx)).toBe('Levertijd: 01-10-2026 t/m 31-10-2026')
  })

  it('draait een filter om met niet, en toont dat op de chip', () => {
    const p = project()
    expect(past(p, { soort: 'klant', relatieId: 'R1', niet: true }, ctx)).toBe(false)
    expect(past(p, { soort: 'klant', relatieId: 'R2', niet: true }, ctx)).toBe(true)
    expect(filterLabel({ soort: 'klant', relatieId: 'R1', niet: true }, ctx)).toBe('Klant ≠ VL Machinebouw')
    expect(filterLabel({ soort: 'signaal', signaal: 'teFactureren', niet: true }, ctx)).toBe('Niet: Te factureren')
  })

  it('vervangt de tegenpool in plaats van beide te zetten', () => {
    const is = { soort: 'klant', relatieId: 'R1' } as const
    const niet = { soort: 'klant', relatieId: 'R1', niet: true } as const
    expect(voegToe([is], niet)).toEqual([niet])
    expect(voegToe([niet], niet)).toEqual([niet])
    expect(voegToe([{ soort: 'klant', relatieId: 'R2' }], niet)).toHaveLength(2)
  })
})

describe('snelleFilters (rechtermuisknop)', () => {
  const basis = { nu: NU, klantNaam: 'VL Machinebouw', contactNaam: '', statusLabel: 'Offerte' }

  it('biedt alleen wat voor de rij geldt, met de aangeklikte kolom eerst', () => {
    const p = project({ status: 'offerte' })
    const s = signalenVan(p, NU, 21)
    const opStatus = snelleFilters(p, { ...basis, kolomId: 'status', signalen: s, actief: [] })
    expect(opStatus[0].label).toBe('Status: Offerte')
    expect(opStatus.map((x) => x.label)).toContain('Klant: VL Machinebouw')
    // Geen contactpersoon op dit project, dus ook geen contactfilter.
    expect(opStatus.some((x) => x.label.startsWith('Contact'))).toBe(false)
    // De offerte staat sinds 1 september uit: het signaal staat erbij.
    expect(opStatus.map((x) => x.label)).toContain('Geen reactie op offerte')
  })

  it('laat weg wat al als chip aanstaat', () => {
    const p = project()
    const lijst = snelleFilters(p, { ...basis, kolomId: null, signalen: signalenVan(p, NU, 21), actief: [{ soort: 'klant', relatieId: 'R1' }] })
    expect(lijst.some((x) => x.label.startsWith('Klant'))).toBe(false)
  })
})
