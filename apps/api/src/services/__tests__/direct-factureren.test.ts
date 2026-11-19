import { describe, it, expect } from 'vitest'
import {
  conceptFactuurId, factuurNaam, factuurNummerTekst, factuurReeks, heeftFactuurnummer, isConceptFactuurId,
  waaromNietFactuurWeg, waaromNietNummerIntrekken, waaromNietVersturenVan, waaromNietBetaaldVan,
  leveringVanFactuur, leverdatumTekst,
  afspraakGeldtOp, geldendeAfspraak, afspraakVoorKlant, afspraakTekst, waaromNietPrijsafspraak,
  losseRegels, waaromNietLosseRegels, losseCreditOpen, voorstelLosseCredit, waaromNietLosseCredit, waaromNietLos,
  voorraadTekorten, voorraadWaarschuwing, losseFactuurOpvolging,
  type Project, type Factuur, type Paklijst, type ProductieOrder, type VerkoopFactuur, type Prijsafspraak,
} from '@stockmanager/shared'

/**
 * Direct factureren (2026-11-18): factuurnummer pas bij versturen, leverdatum,
 * prijsafspraken en losse facturen. De regels staan in `packages/shared`.
 */

const NU = '2026-11-18T10:00:00.000Z'

describe('factuurnummer pas bij versturen', () => {
  it('herkent een nummer en een concept', () => {
    expect(heeftFactuurnummer('FACT-2026-014')).toBe(true)
    expect(heeftFactuurnummer('CRED-2026-001')).toBe(true)
    expect(heeftFactuurnummer('FACT-concept-ab12cd34')).toBe(false)
    expect(isConceptFactuurId('CRED-concept-ab12cd34')).toBe(true)
    expect(isConceptFactuurId('FACT-2026-014')).toBe(false)
  })

  it('maakt een concept-id dat nooit op een nummer lijkt', () => {
    const id = conceptFactuurId('factuur', () => 0.5)
    expect(id).toMatch(/^FACT-concept-[0-9a-z]{8}$/)
    expect(heeftFactuurnummer(id)).toBe(false)
    expect(conceptFactuurId('credit')).toMatch(/^CRED-concept-/)
  })

  it('noemt een concept geen nummer', () => {
    expect(factuurNaam({ id: 'FACT-concept-x', soort: 'factuur' })).toBe('de conceptfactuur')
    expect(factuurNaam({ id: 'CRED-concept-x', soort: 'credit' })).toBe('de conceptcredit')
    expect(factuurNaam({ id: 'FACT-2026-003', soort: 'factuur' })).toBe('FACT-2026-003')
    expect(factuurNummerTekst('FACT-concept-x')).toBe('Concept')
    expect(factuurNummerTekst('FACT-2026-003')).toBe('FACT-2026-003')
  })

  it('leest jaar en volgnummer', () => {
    expect(factuurReeks('FACT-2026-014')).toEqual({ prefix: 'FACT', jaar: 2026, n: 14 })
    expect(factuurReeks('CRED-2027-001')).toEqual({ prefix: 'CRED', jaar: 2027, n: 1 })
    expect(factuurReeks('FACT-concept-x')).toBeNull()
  })

  const f = (id: string, over: Partial<Factuur> = {}) =>
    ({ id, soort: 'factuur' as const, verzondenOp: null, regels: [{}], ...over })

  it('een concept mag weg, een genummerde niet', () => {
    expect(waaromNietFactuurWeg(f('FACT-concept-x'))).toBeNull()
    expect(waaromNietFactuurWeg(f('FACT-2026-003'))).toContain('heeft al een nummer')
    expect(waaromNietFactuurWeg(f('FACT-2026-003', { verzondenOp: NU }))).toContain('al verstuurd')
    expect(waaromNietFactuurWeg(undefined)).toContain('bestaat niet')
  })

  it('intrekken alleen bij een genummerde die niet verstuurd is', () => {
    expect(waaromNietNummerIntrekken(f('FACT-2026-003'))).toBeNull()
    expect(waaromNietNummerIntrekken(f('FACT-concept-x'))).toContain('nog geen nummer')
    expect(waaromNietNummerIntrekken(f('FACT-2026-003', { verzondenOp: NU }))).toContain('al verstuurd')
  })

  it('versturen vraagt regels en een mailadres', () => {
    expect(waaromNietVersturenVan(f('FACT-concept-x', { regels: [] }), 'a@b.nl')).toContain('De conceptfactuur heeft nog geen regels')
    expect(waaromNietVersturenVan(f('FACT-concept-x'), '  ')).toContain('geen mailadres voor de conceptfactuur')
    expect(waaromNietVersturenVan(f('FACT-concept-x'), 'a@b.nl')).toBeNull()
  })

  it('betaald alleen bij een verstuurde factuur', () => {
    expect(waaromNietBetaaldVan(f('FACT-concept-x'))).toContain('De conceptfactuur is nog niet verstuurd')
    expect(waaromNietBetaaldVan(f('CRED-2026-001', { soort: 'credit', verzondenOp: NU }))).toContain('verrekend')
    expect(waaromNietBetaaldVan(f('FACT-2026-003', { verzondenOp: NU }))).toBeNull()
  })
})

// ── Leverdatum ──────────────────────────────────────────────────────────────

function order(id: string): ProductieOrder {
  return {
    id, projectId: 'PRJ', offerteRegelId: `r-${id}`, artikelId: null, artikelNaam: id, qty: 20, eenheid: 'st',
    aantalGereed: 20, status: 'gereed', createdAt: NU, updatedAt: NU, stappen: [],
  }
}
function pakbon(id: string, op: string | null, regels: [string, number][]): Paklijst {
  return {
    id, projectId: 'PRJ', notities: '', createdAt: NU, verzondenOp: op,
    regels: regels.map(([o, qty]) => ({ productieOrderId: o, offerteRegelId: `r-${o}`, artikelNaam: o, qty, eenheid: 'st' })),
  }
}
function pf(id: string, regels: [string, number][], over: Partial<Factuur> = {}): Factuur {
  return {
    id, soort: 'factuur', crediteertFactuurId: null, projectId: 'PRJ', offerteId: 'OFF', btwPct: 21,
    regels: regels.map(([o, qty]) => ({ offerteRegelId: `r-${o}`, naam: o, qty, eenheid: 'st', verkoopprijs: 1, totaal: qty })),
    subtotaal: 0, btwBedrag: 0, totaalInclBtw: 0, notities: '', vervaldatum: null, verzondenOp: null, naarEmail: null,
    betaaldOp: null, createdAt: NU, ...over,
  }
}
function prj(paklijsten: Paklijst[], facturen: Factuur[]): Project {
  return {
    id: 'PRJ', naam: 'Test', relatieId: null, contactId: null, klantRef: null, status: 'verzonden', statusReden: null,
    statusVorige: null, levertijdDatum: null, notities: '', offertes: [], opdrachtbevestiging: null as never,
    productieOrders: [order('A'), order('B')], paklijsten, facturen, createdAt: NU, updatedAt: NU,
  }
}

describe('leverdatum op de projectfactuur', () => {
  const pakbonnen = [
    pakbon('PL-2', '2026-11-10T09:00:00.000Z', [['A', 10]]),
    pakbon('PL-3', '2026-11-12T09:00:00.000Z', [['A', 10], ['B', 5]]),
    pakbon('PL-9', null, [['B', 5]]),
  ]

  it('één factuur over alles: van de eerste tot de laatste pakbon', () => {
    const p = prj(pakbonnen, [pf('F1', [['A', 20], ['B', 5]])])
    expect(leveringVanFactuur(p, 'F1')).toEqual({ data: ['2026-11-10', '2026-11-12'], pakbonnen: ['PL-2', 'PL-3'] })
  })

  it('twee facturen na elkaar: eerst geleverd, eerst gefactureerd', () => {
    const p = prj(pakbonnen, [
      pf('F1', [['A', 10]], { verzondenOp: '2026-11-11T09:00:00.000Z' }),
      pf('F2', [['A', 10], ['B', 5]]),
    ])
    expect(leveringVanFactuur(p, 'F1')).toEqual({ data: ['2026-11-10'], pakbonnen: ['PL-2'] })
    expect(leveringVanFactuur(p, 'F2')).toEqual({ data: ['2026-11-12'], pakbonnen: ['PL-3'] })
  })

  it('een credit geeft stuks terug, die de volgende factuur weer neemt', () => {
    const p = prj(pakbonnen, [
      pf('F1', [['A', 10]], { verzondenOp: '2026-11-11T09:00:00.000Z' }),
      pf('C1', [['A', 10]], { soort: 'credit', verzondenOp: '2026-11-11T10:00:00.000Z' }),
      pf('F2', [['A', 10]]),
    ])
    expect(leveringVanFactuur(p, 'F2').pakbonnen).toEqual(['PL-2'])
  })

  it('meer gefactureerd dan geleverd komt op de laatste pakbon', () => {
    const p = prj(pakbonnen, [pf('F1', [['A', 25]])])
    expect(leveringVanFactuur(p, 'F1').pakbonnen).toEqual(['PL-2', 'PL-3'])
  })

  it('geen pakbon of een credit: geen leverdatum', () => {
    expect(leveringVanFactuur(prj([], [pf('F1', [['A', 5]])]), 'F1').data).toEqual([])
    expect(leveringVanFactuur(prj(pakbonnen, [pf('C1', [['A', 5]], { soort: 'credit' })]), 'C1').data).toEqual([])
  })

  it('schrijft één dag of een periode', () => {
    expect(leverdatumTekst([])).toBeNull()
    expect(leverdatumTekst(['2026-11-10'])).toBe('10-11-2026')
    expect(leverdatumTekst(['2026-11-10', '2026-11-12'])).toBe('10-11-2026 t/m 12-11-2026')
  })
})

// ── Prijsafspraak ───────────────────────────────────────────────────────────

const afspraak = (prijs: number, vanafAantal = 1, geldigVan: string | null = null, geldigTot: string | null = null): Prijsafspraak => ({
  id: `a-${prijs}`, artikelId: 'ART', prijs, vanafAantal, geldigVan, geldigTot, kenmerk: null, door: null,
  createdAt: NU, updatedAt: NU,
})

describe('prijsafspraak', () => {
  it('geldt binnen van en tot, grenzen tellen mee', () => {
    expect(afspraakGeldtOp({ geldigVan: '2026-01-01', geldigTot: '2026-12-31' }, '2026-12-31')).toBe(true)
    expect(afspraakGeldtOp({ geldigVan: '2026-01-01', geldigTot: '2026-12-31' }, '2027-01-01')).toBe(false)
    expect(afspraakGeldtOp({ geldigVan: null, geldigTot: null }, '1999-01-01')).toBe(true)
  })

  it('staffel: de hoogste die het aantal haalt', () => {
    const lijst = [afspraak(10), afspraak(9, 10), afspraak(8, 50)]
    expect(geldendeAfspraak(lijst, 5, '2026-11-18')?.prijs).toBe(10)
    expect(geldendeAfspraak(lijst, 10, '2026-11-18')?.prijs).toBe(9)
    expect(geldendeAfspraak(lijst, 49, '2026-11-18')?.prijs).toBe(9)
    expect(geldendeAfspraak(lijst, 50, '2026-11-18')?.prijs).toBe(8)
  })

  it('een verlopen afspraak telt niet', () => {
    const lijst = [afspraak(10, 1, null, '2026-10-31'), afspraak(11, 1, '2026-11-01')]
    expect(geldendeAfspraak(lijst, 1, '2026-10-15')?.prijs).toBe(10)
    expect(geldendeAfspraak(lijst, 1, '2026-11-18')?.prijs).toBe(11)
    expect(geldendeAfspraak([afspraak(10, 5)], 2, '2026-11-18')).toBeNull()
  })

  it('geldt alleen voor de klant van het artikel', () => {
    expect(afspraakVoorKlant({ relatieId: 'POST' }, 'POST', [afspraak(10)], 1, '2026-11-18')?.prijs).toBe(10)
    expect(afspraakVoorKlant({ relatieId: 'POST' }, 'ANDER', [afspraak(10)], 1, '2026-11-18')).toBeNull()
    expect(afspraakVoorKlant({ relatieId: null }, 'ANDER', [afspraak(10)], 1, '2026-11-18')?.prijs).toBe(10)
  })

  it('beschrijft de afspraak kort', () => {
    expect(afspraakTekst(afspraak(12.5))).toBe('€ 12,50')
    expect(afspraakTekst(afspraak(9, 10, null, '2026-12-31'))).toBe('€ 9,00, vanaf 10 st, t/m 31-12-2026')
    expect(afspraakTekst(afspraak(9, 1, '2026-01-01', '2026-12-31'))).toBe('€ 9,00, 01-01-2026 t/m 31-12-2026')
  })

  it('weigert een afspraak die niet kan', () => {
    const inv = { prijs: 10, vanafAantal: 1, geldigVan: null, geldigTot: null }
    expect(waaromNietPrijsafspraak(inv, [])).toBeNull()
    expect(waaromNietPrijsafspraak({ ...inv, prijs: 0 }, [])).toContain('groter dan € 0')
    expect(waaromNietPrijsafspraak({ ...inv, vanafAantal: 1.5 }, [])).toContain('heel getal')
    expect(waaromNietPrijsafspraak({ ...inv, geldigVan: '2026-12-01', geldigTot: '2026-11-01' }, [])).toContain('vóór')
    expect(waaromNietPrijsafspraak(inv, [afspraak(9)])).toContain('al een afspraak')
    // Andere staffel of een periode die niet overlapt: mag.
    expect(waaromNietPrijsafspraak({ ...inv, vanafAantal: 10 }, [afspraak(9)])).toBeNull()
    expect(waaromNietPrijsafspraak({ ...inv, geldigVan: '2027-01-01' }, [afspraak(9, 1, null, '2026-12-31')])).toBeNull()
    expect(waaromNietPrijsafspraak({ ...inv, geldigVan: '2026-12-31' }, [afspraak(9, 1, null, '2026-12-31')])).toContain('al een afspraak')
  })
})

// ── Losse factuur ───────────────────────────────────────────────────────────

function los(id: string, regels: [string | null, string, number, number][], over: Partial<VerkoopFactuur> = {}): VerkoopFactuur {
  const r = regels.map(([artikelId, naam, qty, prijs]) => ({
    offerteRegelId: null, artikelId, naam, qty, eenheid: 'st', verkoopprijs: prijs, totaal: qty * prijs,
  }))
  return {
    id, soort: 'factuur', crediteertFactuurId: null, projectId: null, projectNaam: null, relatieId: 'POST',
    klantNaam: 'Post', contactId: null, klantRef: null, leverdatum: null, reden: null, retour: false, regels: r,
    btwPct: 21, subtotaal: 0, btwBedrag: 0, totaalInclBtw: 121, notities: '', vervaldatum: null, verzondenOp: null,
    naarEmail: null, betaaldOp: null, createdAt: NU, ...over,
  }
}

describe('losse factuur', () => {
  it('rondt het regeltotaal af op centen', () => {
    expect(losseRegels([{ artikelId: 'A', naam: ' Bus ', qty: 3, eenheid: '', verkoopprijs: 0.333 }])).toEqual([
      { offerteRegelId: null, artikelId: 'A', naam: 'Bus', qty: 3, eenheid: 'st', verkoopprijs: 0.333, totaal: 1 },
    ])
  })

  it('weigert lege, dubbele en foute regels', () => {
    const r = (artikelId: string | null, naam: string, qty = 1, verkoopprijs = 1) => ({ artikelId, naam, qty, eenheid: 'st', verkoopprijs })
    expect(waaromNietLosseRegels([])).toContain('minstens één regel')
    expect(waaromNietLosseRegels([], { leegMag: true })).toBeNull()
    expect(waaromNietLosseRegels([r('A', 'Bus'), r('A', 'Bus')])).toContain('twee keer')
    expect(waaromNietLosseRegels([r(null, 'Verzendkosten'), r(null, 'verzendkosten ')])).toContain('twee keer')
    expect(waaromNietLosseRegels([r('A', 'Bus', 0)])).toContain('groter dan 0')
    expect(waaromNietLosseRegels([r('A', '  ')])).toContain('omschrijving')
    expect(waaromNietLosseRegels([r('A', 'Bus'), r(null, 'Verzendkosten', 1, 0)])).toBeNull()
  })

  it('weigert een projectfactuur op de pagina Facturen', () => {
    expect(waaromNietLos(los('F1', [], { projectId: 'PRJ-1', projectNaam: 'Asbussen' }))).toContain('Asbussen')
    expect(waaromNietLos(los('F1', []))).toBeNull()
    expect(waaromNietLos(undefined)).toContain('bestaat niet')
  })
})

describe('losse credit', () => {
  const factuur = los('FACT-2026-010', [['A', 'Bus', 10, 5], [null, 'Verzendkosten', 1, 12]], { verzondenOp: NU })
  const credit = los('CRED-2026-001', [['A', 'Bus', 4, 5]], { soort: 'credit', crediteertFactuurId: factuur.id, verzondenOp: NU })

  it('weet per regel wat er nog te crediteren valt', () => {
    const open = losseCreditOpen([factuur, credit], factuur.id)
    expect(open.get('A')).toBe(6)
    expect(open.get('vrij:verzendkosten')).toBe(1)
    expect(losseCreditOpen([factuur, credit], factuur.id, credit.id).get('A')).toBe(10)
  })

  it('stelt voor wat er nog openstaat, tegen de prijs van de factuur', () => {
    expect(voorstelLosseCredit([factuur, credit], factuur.id)).toEqual([
      { artikelId: 'A', naam: 'Bus', qty: 6, eenheid: 'st', verkoopprijs: 5 },
      { artikelId: null, naam: 'Verzendkosten', qty: 1, eenheid: 'st', verkoopprijs: 12 },
    ])
  })

  const regel = (qty: number) => ({ artikelId: 'A', naam: 'Bus', qty, eenheid: 'st', verkoopprijs: 5 })

  it('op een factuur: niet meer dan er openstaat', () => {
    const lijst = [factuur, credit]
    const c = (regels: ReturnType<typeof regel>[]) => ({ factuurId: factuur.id, relatieId: 'POST', reden: null, regels })
    expect(waaromNietLosseCredit(lijst, c([regel(6)]))).toBeNull()
    expect(waaromNietLosseCredit(lijst, c([regel(7)]))).toContain('maar 6')
    expect(waaromNietLosseCredit(lijst, c([{ ...regel(1), artikelId: 'X', naam: 'Ander' }]))).toContain('staat niet op')
    expect(waaromNietLosseCredit(lijst, c([]))).toContain('minstens één regel op de creditfactuur')
  })

  it('op een factuur: hij moet een verstuurde losse factuur zijn', () => {
    const c = { factuurId: 'F', relatieId: 'POST', reden: null, regels: [regel(1)] }
    expect(waaromNietLosseCredit([], c)).toContain('bestaat niet')
    expect(waaromNietLosseCredit([los('F', [['A', 'Bus', 1, 5]])], c)).toContain('nog niet verstuurd')
    expect(waaromNietLosseCredit([los('F', [['A', 'Bus', 1, 5]], { verzondenOp: NU, projectId: 'PRJ-1' })], c)).toContain('Facturen-tab')
    expect(waaromNietLosseCredit([los('F', [['A', 'Bus', 1, 5]], { verzondenOp: NU, soort: 'credit' })], c)).toContain('kun je niet crediteren')
  })

  it('al volledig gecrediteerd', () => {
    const vol = los('CRED-2026-002', [['A', 'Bus', 6, 5], [null, 'Verzendkosten', 1, 12]], { soort: 'credit', crediteertFactuurId: factuur.id })
    expect(waaromNietLosseCredit([factuur, credit, vol], { factuurId: factuur.id, relatieId: 'POST', reden: null, regels: [] }))
      .toContain('al volledig gecrediteerd')
  })

  it('los: een klant en een reden', () => {
    const c = { factuurId: null, relatieId: 'POST', reden: 'prijscorrectie oktober', regels: [regel(1)] }
    expect(waaromNietLosseCredit([], c)).toBeNull()
    expect(waaromNietLosseCredit([], { ...c, relatieId: null })).toContain('Kies de klant')
    expect(waaromNietLosseCredit([], { ...c, reden: 'ok' })).toContain('Zeg waarom')
    expect(waaromNietLosseCredit([], { ...c, regels: [] }, { leegMag: true })).toBeNull()
    expect(waaromNietLosseCredit([], { ...c, regels: [] })).toContain('op de creditfactuur')
  })
})

describe('voorraad bij een losse factuur', () => {
  it('waarschuwt alleen bij te weinig, per artikel opgeteld', () => {
    const regels = [
      { artikelId: 'A', naam: 'Bus', qty: 3 }, { artikelId: 'A', naam: 'Bus', qty: 3 },
      { artikelId: 'B', naam: 'Pen', qty: 1 }, { artikelId: null, naam: 'Verzendkosten', qty: 1 },
    ]
    const tekorten = voorraadTekorten(regels, (id) => (id === 'A' ? 5 : 10))
    expect(tekorten).toEqual([{ artikelId: 'A', naam: 'Bus', qty: 6, vrij: 5 }])
    expect(voorraadWaarschuwing(tekorten)).toContain('Bus: 6 op de factuur, 5 vrij op voorraad')
    expect(voorraadWaarschuwing([])).toBeNull()
  })
})

describe('opvolging van losse facturen', () => {
  const nu = new Date('2026-11-18T10:00:00.000Z')

  it('vervallen en niet betaald: rood', () => {
    const f = los('FACT-2026-010', [], { verzondenOp: '2026-10-01T09:00:00.000Z', vervaldatum: '2026-10-31' })
    const m = losseFactuurOpvolging(f, nu)
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ ernst: 'rood', link: '/facturen' })
    expect(m[0].tekst).toContain('Post')
    expect(losseFactuurOpvolging({ ...f, betaaldOp: NU }, nu)).toEqual([])
  })

  it('concept dat blijft liggen: oranje', () => {
    const f = los('FACT-concept-x', [], { createdAt: '2026-11-10T09:00:00.000Z' })
    const m = losseFactuurOpvolging(f, nu)
    expect(m[0]).toMatchObject({ ernst: 'oranje', titel: 'Concept-factuur niet verstuurd' })
    expect(m[0].tekst).toMatch(/^Conceptfactuur/)
    expect(losseFactuurOpvolging({ ...f, createdAt: NU }, nu)).toEqual([])
  })

  it('een projectfactuur hoort bij de projectregels, niet hier', () => {
    expect(losseFactuurOpvolging(los('F', [], { projectId: 'PRJ-1', createdAt: '2026-01-01T00:00:00.000Z' }), nu)).toEqual([])
  })
})
