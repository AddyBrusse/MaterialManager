import { describe, it, expect } from 'vitest'
import {
  isTestDatabase, omgevingVan, vraagtTest, waaromNietStarten, kopieTijdUit, waaromNietSeeden,
} from '@stockmanager/shared'

// De testomgeving voor de managers (2026-11-03): de database zegt wat hij is.
describe('isTestDatabase / omgevingVan', () => {
  it('herkent een naam die op _test eindigt', () => {
    expect(isTestDatabase('shopcommand_test')).toBe(true)
    expect(isTestDatabase('SHOPCOMMAND_TEST ')).toBe(true)
    expect(omgevingVan('shopcommand_test')).toBe('test')
  })

  it('ziet al het andere als echt', () => {
    for (const naam of ['stockmanager', 'test', 'test_stockmanager', 'shopcommand_testen', '']) {
      expect(isTestDatabase(naam)).toBe(false)
      expect(omgevingVan(naam)).toBe('echt')
    }
  })
})

describe('waaromNietStarten (slot 1)', () => {
  it('houdt de test-app tegen op een echte database', () => {
    const reden = waaromNietStarten('test', 'stockmanager')
    expect(reden).toContain('"stockmanager"')
    expect(reden).toContain('.env.test')
    expect(reden).toContain('niets gewijzigd')
  })

  it('laat de test-app starten op een testdatabase', () => {
    expect(waaromNietStarten('test', 'shopcommand_test')).toBeNull()
    expect(waaromNietStarten(' TEST ', 'shopcommand_test')).toBeNull()
  })

  it('houdt de echte app nooit tegen, ook niet op een testdatabase', () => {
    expect(waaromNietStarten(undefined, 'stockmanager')).toBeNull()
    expect(waaromNietStarten('', 'shopcommand_test')).toBeNull()
    expect(waaromNietStarten('productie', 'stockmanager')).toBeNull()
  })

  it('vraagtTest leest OMGEVING zonder op hoofdletters te letten', () => {
    expect(vraagtTest('Test')).toBe(true)
    expect(vraagtTest(undefined)).toBe(false)
    expect(vraagtTest('testen')).toBe(false)
  })
})

describe('kopieTijdUit', () => {
  it('leest het commentaar dat het kopieerscript zet', () => {
    expect(kopieTijdUit('kopie:2026-11-03T10:00:00Z')).toBe('2026-11-03T10:00:00Z')
  })

  it('geeft null bij geen of ander commentaar', () => {
    expect(kopieTijdUit(null)).toBeNull()
    expect(kopieTijdUit('iets anders')).toBeNull()
    expect(kopieTijdUit('kopie:geen-datum')).toBeNull()
  })
})

describe('waaromNietSeeden (slot 2)', () => {
  it('weigert zodra er relaties, artikelen of voorraad zijn', () => {
    expect(waaromNietSeeden({ relaties: 12, artikelen: 0, voorraad: 0 })).toContain('12 relaties')
    expect(waaromNietSeeden({ relaties: 1, artikelen: 1, voorraad: 0 })).toContain('1 relatie, 1 artikel.')
    expect(waaromNietSeeden({ relaties: 0, artikelen: 3, voorraad: 5 })).toContain('3 artikelen, 5 voorraadregels')
  })

  it('mag op een lege database (of na een eerdere seed)', () => {
    expect(waaromNietSeeden({ relaties: 0, artikelen: 0, voorraad: 0 })).toBeNull()
  })
})
