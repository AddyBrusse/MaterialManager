import { describe, it, expect } from 'vitest'
import {
  bepaalMachineId, bepaalToewijzing, hoortBijMachine, normaliseerMachine,
} from '../terminal-wachtrij'

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

describe('bepaalMachineId', () => {
  const OPGESLAGEN = { id: 'term-1', machineId: null }

  it('neemt de koppeling van de server, niet uit de opgeslagen inlog', () => {
    // De klacht van 2026-09-14: op kantoor gekoppeld, maar het scherm in de hal
    // was ingelogd vóór die koppeling en toonde daarom alle werk.
    expect(bepaalMachineId([{ id: 'term-1', machineId: 'mach_dmg' }], OPGESLAGEN))
      .toBe('mach_dmg')
  })

  it('volgt de server ook als die de koppeling weghaalt', () => {
    expect(bepaalMachineId([{ id: 'term-1', machineId: null }], { id: 'term-1', machineId: 'oud' }))
      .toBeNull()
  })

  it('valt terug op de opgeslagen waarde zolang de lijst onderweg is', () => {
    // Zonder deze terugval springt het scherm bij elke verversing even van de
    // eigen wachtrij naar alles.
    expect(bepaalMachineId(undefined, { id: 'term-1', machineId: 'mach_dmg' })).toBe('mach_dmg')
  })

  it('geeft niets terug zonder ingelogd account', () => {
    expect(bepaalMachineId([{ id: 'term-1', machineId: 'mach_dmg' }], null)).toBeNull()
  })
})
