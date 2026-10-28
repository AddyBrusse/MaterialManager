import { describe, it, expect } from 'vitest'
import {
  klokOpvolging, projectOpvolging, receptOpvolging, todoOpvolging,
  type Factuur, type Offerte, type OfferteRegel, type Paklijst, type ProductieOrder, type Project,
} from '@stockmanager/shared'

// Woensdag 28-10-2026. Twee werkdagen terug is maandag 26-10, drie is vrijdag 23-10.
const NU = new Date('2026-10-28T10:00:00')
const MA = '2026-10-26T09:00:00'
const DI = '2026-10-27T09:00:00'
const VR = '2026-10-23T09:00:00'

const regel: OfferteRegel = {
  id: 'R1', sortOrder: 1, artikelId: 'ART-1', naam: 'As', omschrijving: '', qty: 10, eenheid: 'st',
  verkoopprijs: 12.5, totaal: 125, bewerkingen: [],
}

function offerte(o: Partial<Offerte> = {}): Offerte {
  return {
    id: 'OFF-2026-001', documentNr: 'OFF-2026-001', projectId: 'PRJ-1', versie: 1, status: 'concept', regels: [regel],
    notities: '', externeRef: null, direct: false, vervallenDoor: null, geldigTot: null, verzondenOp: null, geaccepteerdOp: null,
    createdAt: MA, updatedAt: MA, ...o,
  }
}

function order(o: Partial<ProductieOrder> = {}): ProductieOrder {
  return {
    id: 'PROD-1', projectId: 'PRJ-1', offerteRegelId: 'R1', artikelId: 'ART-1', artikelNaam: 'As',
    qty: 10, eenheid: 'st', aantalGereed: 0, stappen: [], status: 'voorbereiding', createdAt: MA, updatedAt: MA, ...o,
  } as ProductieOrder
}

function pakbon(qty: number, verzondenOp: string | null): Paklijst {
  return {
    id: 'PL-1', projectId: 'PRJ-1', notities: '', verzondenOp, createdAt: verzondenOp ?? MA,
    regels: [{ productieOrderId: 'PROD-1', offerteRegelId: 'R1', artikelNaam: 'As', qty, eenheid: 'st' }],
  } as Paklijst
}

function factuur(f: Partial<Factuur> = {}): Factuur {
  return {
    id: 'FAC-2026-001', soort: 'factuur', crediteertFactuurId: null, projectId: 'PRJ-1', offerteId: 'OFF-2026-001',
    regels: [{ offerteRegelId: 'R1', naam: 'As', qty: 10, eenheid: 'st', verkoopprijs: 12.5, totaal: 125 }],
    btwPct: 21, subtotaal: 125, btwBedrag: 26.25, totaalInclBtw: 151.25,
    notities: '', vervaldatum: null, verzondenOp: null, betaaldOp: null, createdAt: MA, ...f,
  } as Factuur
}

function project(p: Partial<Project> = {}): Project {
  return {
    id: 'PRJ-1', naam: 'Assen', relatieId: 'REL-1', contactId: null, klantRef: null,
    status: 'concept', statusReden: null, statusVorige: null, levertijdDatum: null,
    notities: '', offertes: [], opdrachtbevestiging: null, productieOrders: [],
    paklijsten: [], facturen: [], createdAt: MA, updatedAt: MA, ...p,
  } as Project
}

const ob = (verzondenOp: string | null) => ({ id: 'OB-2026-001', regels: [regel], verzondenOp }) as Project['opdrachtbevestiging']

const titels = (p: Project) => projectOpvolging(p, 'Prins BV', NU).map((m) => m.titel)

// Een project waar de offerte geaccepteerd is en de opdrachtbevestiging verstuurd.
const geaccepteerd = (p: Partial<Project> = {}) => project({
  status: 'productie',
  offertes: [offerte({ status: 'geaccepteerd', geaccepteerdOp: VR, verzondenOp: VR })],
  opdrachtbevestiging: ob(VR),
  ...p,
})

describe('opvolging per project', () => {
  it('1. concept-offerte: pas na twee werkdagen, niet bij een directe opdracht', () => {
    expect(titels(project({ offertes: [offerte({ createdAt: DI })] }))).toEqual([])
    expect(titels(project({ offertes: [offerte()] }))).toEqual(['Concept-offerte niet verstuurd'])
    expect(titels(project({ offertes: [offerte({ direct: true })] }))).toEqual([])
    const m = projectOpvolging(project({ offertes: [offerte()] }), 'Prins BV', NU)[0]
    expect(m).toMatchObject({ id: 'opv:concept:OFF-2026-001', groep: 'opvolging', ernst: 'oranje', link: '/projecten/PRJ-1' })
    expect(m.tekst).toContain('PRJ-1 · Prins BV')
    expect(m.tekst).toContain('26-10')
  })

  it('2. project zonder offerte: na één werkdag', () => {
    expect(titels(project({ createdAt: DI }))).toEqual(['Project zonder offerte'])
    expect(titels(project({ createdAt: '2026-10-28T08:00:00' }))).toEqual([])
    expect(titels(project({ status: 'offerte', createdAt: VR }))).toEqual([])
  })

  it('3. opdrachtbevestiging niet verstuurd, ook als hij in concept staat', () => {
    expect(titels(geaccepteerd({ opdrachtbevestiging: null }))).toEqual(['Opdrachtbevestiging niet verstuurd'])
    const concept = projectOpvolging(geaccepteerd({ opdrachtbevestiging: ob(null) }), null, NU)
    expect(concept[0].tekst).toContain('in concept')
    expect(titels(geaccepteerd())).toEqual([])
    // Vandaag geaccepteerd: nog geen werkdag voorbij.
    expect(titels(geaccepteerd({ opdrachtbevestiging: null, offertes: [offerte({ status: 'geaccepteerd', geaccepteerdOp: '2026-10-28T08:00:00' })] }))).toEqual([])
  })

  it('4. nog niet in productie gegeven: na twee werkdagen in voorbereiding', () => {
    expect(titels(geaccepteerd({ productieOrders: [order()] }))).toEqual(['Nog niet in productie gegeven'])
    expect(titels(geaccepteerd({ productieOrders: [order({ createdAt: DI })] }))).toEqual([])
    expect(titels(geaccepteerd({ productieOrders: [order({ status: 'gepland' })] }))).toEqual([])
  })

  it('5. over levertijd: rood zolang niet alles geleverd is', () => {
    const p = geaccepteerd({ levertijdDatum: '2026-10-27', productieOrders: [order({ status: 'in_productie' })] })
    expect(projectOpvolging(p, null, NU)).toEqual([expect.objectContaining({ titel: 'Over levertijd', ernst: 'rood' })])
    expect(titels({ ...p, levertijdDatum: '2026-10-28' })).toEqual([])
  })

  it('6. gemaakt, nog niet geleverd: twee werkdagen na gereed', () => {
    const gereed = (op: string) => geaccepteerd({
      productieOrders: [order({ status: 'gereed', aantalGereed: 10, stappen: [{ gereedOp: op } as ProductieOrder['stappen'][number]] })],
    })
    expect(titels(gereed(MA))).toEqual(['Gemaakt, nog niet geleverd'])
    expect(titels(gereed(DI))).toEqual([])
  })

  it('7. geleverd, nog niet gefactureerd: twee werkdagen na de pakbon', () => {
    const geleverd = (op: string, facturen: Factuur[] = []) => geaccepteerd({
      status: 'verzonden',
      productieOrders: [order({ status: 'gereed', aantalGereed: 10 })],
      paklijsten: [pakbon(10, op)], facturen,
    })
    expect(titels(geleverd(MA))).toEqual(['Geleverd, nog niet gefactureerd'])
    expect(titels(geleverd(DI))).toEqual([])
    expect(titels(geleverd(VR, [factuur({ verzondenOp: MA })]))).toEqual([])
    // Een factuur in concept telt als gefactureerd, maar de klant heeft hem niet: eigen melding.
    expect(titels(geleverd(VR, [factuur({ createdAt: MA })]))).toEqual(['Concept-factuur niet verstuurd'])
    expect(titels(geleverd(VR, [factuur({ createdAt: DI })]))).toEqual([])
  })

  it('8. factuur over de vervaldatum: rood, ook als het project stilligt', () => {
    const f = factuur({ verzondenOp: '2026-09-28T10:00:00', vervaldatum: '2026-10-27' })
    const p = geaccepteerd({ status: 'on_hold', facturen: [f] })
    expect(projectOpvolging(p, null, NU)).toEqual([expect.objectContaining({ titel: 'Factuur over de vervaldatum', ernst: 'rood' })])
    expect(titels({ ...p, facturen: [{ ...f, betaaldOp: '2026-10-27' }] })).toEqual([])
    expect(titels({ ...p, status: 'geannuleerd' })).toEqual([])
  })

  it('9. verstuurde offerte verloopt binnen een week, of is al verlopen', () => {
    const uit = (geldigTot: string) => project({ status: 'offerte', offertes: [offerte({ status: 'verzonden', verzondenOp: VR, geldigTot })] })
    expect(titels(uit('2026-11-04'))).toEqual(['Offerte verloopt binnenkort'])
    expect(titels(uit('2026-11-05'))).toEqual([])
    expect(titels(uit('2026-10-27'))).toEqual(['Offerte verlopen zonder antwoord'])
  })

  it('on hold en geannuleerd zwijgen, behalve een vervallen factuur', () => {
    expect(titels(project({ status: 'on_hold', offertes: [offerte()] }))).toEqual([])
    expect(titels(project({ status: 'geannuleerd', createdAt: VR }))).toEqual([])
  })
})

describe('opvolging los van een project', () => {
  const klok = { id: 'T1', projectId: 'PRJ-1', artikelNaam: 'As', machineNaam: 'Mazak', userNaam: 'Jan', bemand: true, gemetenSeconden: 0, bijgesteldeSeconden: null }

  it('10. klok: bemand na 6 uur, onbemand pas na 24 uur', () => {
    const sinds = (uur: number) => new Date(NU.getTime() - uur * 3_600_000).toISOString()
    expect(klokOpvolging({ ...klok, lopendSinds: sinds(5.9) }, NU)).toBeNull()
    expect(klokOpvolging({ ...klok, lopendSinds: sinds(7) }, NU)).toMatchObject({ titel: 'Klok loopt al lang', link: '/tijdregistratie' })
    expect(klokOpvolging({ ...klok, bemand: false, lopendSinds: sinds(20) }, NU)).toBeNull()
    expect(klokOpvolging({ ...klok, bemand: false, lopendSinds: sinds(25) }, NU)?.tekst).toContain('Onbemand op Mazak')
    expect(klokOpvolging({ ...klok, lopendSinds: null }, NU)).toBeNull()
  })

  it('11. todo: pas de dag na de deadline', () => {
    const t = { id: '7', titel: 'Tekening nakijken', deadline: '2026-10-28', opgepaktDoor: null }
    expect(todoOpvolging(t, '2026-10-28')).toBeNull()
    expect(todoOpvolging({ ...t, deadline: '2026-10-27' }, '2026-10-28')?.tekst).toContain('niemand heeft hem opgepakt')
    expect(todoOpvolging({ ...t, deadline: null }, '2026-10-28')).toBeNull()
  })

  it('12. artikel zonder recept: link naar het artikel, hooguit drie projecten bij naam', () => {
    const m = receptOpvolging({ id: 'ART 1', naam: 'As', projecten: ['PRJ-1', 'PRJ-2', 'PRJ-3', 'PRJ-4', 'PRJ-5'] })
    expect(m.link).toBe('/artikelen/ART%201')
    expect(m.tekst).toContain('PRJ-1, PRJ-2, PRJ-3 en nog 2')
  })
})
