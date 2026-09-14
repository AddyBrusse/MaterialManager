import { describe, it, expect } from 'vitest'
import { bepaalToewijzing, hoortBijMachine, normaliseerMachine } from '../terminal-wachtrij'

const MACHINES = ['DMG 450TC EcoLine', 'Draaibank', 'Amada Zaag']

describe('bepaalToewijzing', () => {
  it('herkent de eigen machine', () => {
    expect(bepaalToewijzing('DMG 450TC EcoLine', 'DMG 450TC EcoLine', MACHINES))
      .toEqual({ soort: 'eigen' })
  })

  it('trekt zich niets aan van hoofdletters en dubbele spaties', () => {
    expect(bepaalToewijzing('  dmg  450tc   ecoline ', 'DMG 450TC EcoLine', MACHINES))
      .toEqual({ soort: 'eigen' })
  })

  it('houdt werk van een andere machine apart', () => {
    expect(bepaalToewijzing('Draaibank', 'DMG 450TC EcoLine', MACHINES))
      .toEqual({ soort: 'andere', machine: 'Draaibank' })
  })

  it('noemt een tekst die geen machine benoemt onbekend', () => {
    // "Draaien" is de naam van de bewerking op de offerteregel, niet van een
    // machine — precies wat api/projects.ts op de stap zet.
    expect(bepaalToewijzing('Draaien', 'DMG 450TC EcoLine', MACHINES))
      .toEqual({ soort: 'onbekend', label: 'Draaien' })
  })

  it('noemt een lege machine onbekend', () => {
    expect(bepaalToewijzing(null, 'DMG 450TC EcoLine', MACHINES))
      .toEqual({ soort: 'onbekend', label: null })
  })
})

describe('hoortBijMachine', () => {
  it('laat niet-toegewezen werk op elke terminal zien', () => {
    // De klacht van 2026-09-14: terminal gekoppeld aan "DMG 450TC EcoLine",
    // stappen met bewerkingen "DMG" en "Draaien", wachtrij toonde nul.
    expect(hoortBijMachine('DMG', 'DMG 450TC EcoLine', MACHINES)).toBe(true)
    expect(hoortBijMachine('Draaien', 'DMG 450TC EcoLine', MACHINES)).toBe(true)
  })

  it('verbergt werk dat op een andere bestaande machine staat', () => {
    expect(hoortBijMachine('Draaibank', 'DMG 450TC EcoLine', MACHINES)).toBe(false)
    expect(hoortBijMachine('Amada Zaag', 'DMG 450TC EcoLine', MACHINES)).toBe(false)
  })

  it('toont alles zolang de terminal aan geen machine hangt', () => {
    expect(hoortBijMachine('Draaibank', null, MACHINES)).toBe(true)
  })
})

describe('normaliseerMachine', () => {
  it('geeft een lege tekst terug voor niets', () => {
    expect(normaliseerMachine(null)).toBe('')
    expect(normaliseerMachine('   ')).toBe('')
  })
})
