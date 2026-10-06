import { describe, it, expect } from 'vitest'
import {
  kgVanRegel, prijsVanAntwoord, prijslijstVoorRegel, celVoor, goedkoopste, perLeverancier, antwoordAlsPrijs,
  waaromNietPrijsaanvraag, waaromNietAanvraagVersturen, waaromNietBestelRegelWijzigen, waaromNietKiezen,
  type Antwoord, type LeverancierPrijs, type Cel,
} from '@stockmanager/shared'

const plaat = { dimensions: { width: 250, height: 30 }, lengteMm: 300, stuks: 4, volumeFormula: 'flat', densityKgM3: 2700 }
const kg = kgVanRegel(plaat) // 4 × 6,075 = 24,3 kg

const prijs = (p: Partial<LeverancierPrijs>): LeverancierPrijs => ({
  id: 'p', leverancierId: 'tata', leverancierNaam: 'Tata', rawMaterialId: null, gradeId: 'alu', prijsSoort: 'per_kg',
  prijs: 7.2, zaagkostenPerSnede: null, minimumBedrag: null, levertijdDagen: null, notitie: null, bijgewerktDoor: null,
  updatedAt: '2026-09-01T00:00:00.000Z', ...p,
})
const antwoord = (a: Partial<Antwoord>): Antwoord => ({
  id: 'a', prijsaanvraagId: 'PA-2026-001', bestelRegelId: 'r', leverancierId: 'voest', prijsSoort: 'per_stuk', prijs: 57,
  zaagkostenPerSnede: null, levertijdDagen: 2, notitie: null, bijgewerktDoor: null, updatedAt: '2026-10-02T00:00:00.000Z', ...a,
})
const regel = { stuks: 4, kg, gradeId: 'alu', rawMaterialId: 'exo', exoot: true }

describe('gewicht van een bestelregel', () => {
  it('telt alle stuks over de bestelde lengte', () => {
    expect(kg).toBeCloseTo(24.3, 6)
  })
})

describe('prijs van een antwoord', () => {
  it('per kg met zagen per snede, zoals in de mockup', () => {
    const p = prijsVanAntwoord({ prijsSoort: 'per_kg', prijs: 7.2, zaagkostenPerSnede: 5.25 }, regel)
    expect(p.totaal).toBeCloseTo(7.2 * 24.3 + 4 * 5.25, 6)
    expect(p.uitleg).toBe('€ 7,20/kg × 24,3 kg + 4 × € 5,25 zagen')
  })
  it('per stuk × stuks', () => {
    expect(prijsVanAntwoord({ prijsSoort: 'per_stuk', prijs: 57, zaagkostenPerSnede: null }, regel).totaal).toBe(228)
  })
  it('totaal is totaal, zagen telt niet apart', () => {
    expect(prijsVanAntwoord({ prijsSoort: 'totaal', prijs: 200, zaagkostenPerSnede: 5 }, regel).totaal).toBe(200)
  })
})

describe('prijslijst voor een regel', () => {
  it('materiaalprijs van dezelfde maat gaat voor de kwaliteitsprijs', () => {
    const m = prijslijstVoorRegel([
      prijs({ id: 'kw', gradeId: 'alu', prijs: 7 }),
      prijs({ id: 'mat', gradeId: null, rawMaterialId: 'zelfde-maat', prijs: 6.5 }),
    ], { gradeId: 'alu', rawMaterialId: null }, ['zelfde-maat'])
    expect(m.get('tata')?.id).toBe('mat')
  })
  it('per stuk alleen voor de exoot zelf, niet voor een staaf van dezelfde maat', () => {
    const lijst = [prijs({ id: 'stuk', gradeId: null, rawMaterialId: 'staaf', prijsSoort: 'per_stuk', prijs: 40 })]
    expect(prijslijstVoorRegel(lijst, { gradeId: 'alu', rawMaterialId: null }, ['staaf']).size).toBe(0)
    const exoot = [prijs({ id: 'stuk', gradeId: null, rawMaterialId: 'exo', prijsSoort: 'per_stuk', prijs: 40 })]
    expect(prijslijstVoorRegel(exoot, { gradeId: 'alu', rawMaterialId: 'exo' }, []).get('tata')?.id).toBe('stuk')
  })
  it('een andere kwaliteit telt niet', () => {
    expect(prijslijstVoorRegel([prijs({ gradeId: 'c45' })], { gradeId: 'alu', rawMaterialId: null }, []).size).toBe(0)
  })
})

describe('cel in de vergelijking', () => {
  const bronnen = {
    prijslijst: new Map([['voest', prijs({ leverancierId: 'voest', prijs: 9 })], ['tata', prijs({})]]),
    antwoorden: [antwoord({})],
    gevraagd: new Map([['arcelor', ['PA-2026-001']]]),
  }
  it('een antwoord gaat voor de prijslijst', () => {
    const c = celVoor(regel, 'voest', bronnen)
    expect(c).toMatchObject({ soort: 'prijs', bron: 'antwoord', totaal: 228, levertijdDagen: 2 })
  })
  it('zonder antwoord de prijslijst', () => {
    expect(celVoor(regel, 'tata', bronnen)).toMatchObject({ soort: 'prijs', bron: 'prijslijst' })
  })
  it('gevraagd maar nog geen antwoord', () => {
    expect(celVoor(regel, 'arcelor', bronnen)).toEqual({ soort: 'gevraagd', aanvraagId: 'PA-2026-001' })
  })
  it('niets bekend', () => {
    expect(celVoor(regel, 'onbekend', bronnen)).toEqual({ soort: 'geen' })
  })
})

describe('goedkoopste en groeperen', () => {
  const c = (totaal: number, dagen: number | null): Cel => ({ soort: 'prijs', bron: 'prijslijst', antwoordId: null, aanvraagId: null, totaal, uitleg: '', levertijdDagen: dagen, datum: '' })
  it('laagste prijs, bij gelijke prijs de snelste', () => {
    expect(goedkoopste(new Map([['a', c(10, 5)], ['b', c(9, 9)]]))).toBe('b')
    expect(goedkoopste(new Map([['a', c(10, 5)], ['b', c(10, 2)]]))).toBe('b')
    expect(goedkoopste(new Map([['a', { soort: 'geen' } as Cel]]))).toBeNull()
  })
  it('per leverancier optellen', () => {
    const k = (id: string, naam: string, totaal: number) => ({ leverancierId: id, leverancierNaam: naam, bron: 'prijslijst' as const, antwoordId: null, totaal, uitleg: '', levertijdDagen: null, gekozenOp: '', gekozenDoor: null })
    const g = perLeverancier([{ id: '1', keuze: k('t', 'Tata', 196.4) }, { id: '2', keuze: k('v', 'Voest', 71.4) }, { id: '3', keuze: k('t', 'Tata', 64.2) }, { id: '4', keuze: null }])
    expect(g.map((x) => [x.naam, x.regelIds.length])).toEqual([['Tata', 2], ['Voest', 1]])
    expect(g[0].totaal).toBeCloseTo(260.6, 6)
  })
})

describe('antwoord als prijs in de prijslijst', () => {
  it('exoot: totaal wordt per stuk', () => {
    expect(antwoordAlsPrijs({ prijsSoort: 'totaal', prijs: 200, zaagkostenPerSnede: null, levertijdDagen: 3 }, regel))
      .toMatchObject({ rawMaterialId: 'exo', prijsSoort: 'per_stuk', prijs: 50 })
  })
  it('gewoon materiaal: per kg naar de kwaliteit, per stuk niet', () => {
    const gewoon = { stuks: 6, rawMaterialId: null, exoot: false, gradeId: 's355' }
    expect(antwoordAlsPrijs({ prijsSoort: 'per_kg', prijs: 1.45, zaagkostenPerSnede: 2.17, levertijdDagen: 3 }, gewoon))
      .toMatchObject({ gradeId: 's355', prijsSoort: 'per_kg', prijs: 1.45 })
    expect(antwoordAlsPrijs({ prijsSoort: 'per_stuk', prijs: 10, zaagkostenPerSnede: null, levertijdDagen: null }, gewoon)).toHaveProperty('reden')
  })
})

describe('voorwaarden', () => {
  it('prijsaanvraag', () => {
    expect(waaromNietPrijsaanvraag([], ['x'])).toMatch(/regels/)
    expect(waaromNietPrijsaanvraag([{ status: 'te_bestellen', materiaal: 'C45' }], [])).toMatch(/leverancier/)
    expect(waaromNietPrijsaanvraag([{ status: 'besteld', materiaal: 'C45' }], ['x'])).toMatch(/inkooporder/)
    expect(waaromNietPrijsaanvraag([{ status: 'aangevraagd', materiaal: 'C45' }], ['x'])).toBeNull()
  })
  it('versturen zonder e-mailadres zegt waar je het invult', () => {
    expect(waaromNietAanvraagVersturen({ naam: 'Tata', email: null })).toMatch(/Relaties → Tata/)
  })
  it('wijzigen alleen zolang hij nog niet is aangevraagd', () => {
    expect(waaromNietBestelRegelWijzigen({ status: 'te_bestellen', materiaal: 'C45' })).toBeNull()
    expect(waaromNietBestelRegelWijzigen({ status: 'aangevraagd', materiaal: 'C45' })).toMatch(/antwoord/)
  })
  it('kiezen kan niet zonder prijs', () => {
    expect(waaromNietKiezen({ status: 'te_bestellen', materiaal: 'C45' }, { soort: 'geen' })).toMatch(/antwoord/)
  })
})
