import { describe, it, expect } from 'vitest'
import { kostprijsVoor, prijsVoor, bewerkingenVan, materiaalVan, type PrijsBronnen } from '../artikel-prijs'
import type { Article } from '../../api/articles'

const bronnen: PrijsBronnen = {
  grades: [{ id: 'g1', name: 'S235', densityKgM3: 7850, pricePerKg: 2 } as never],
  profiles: [{ id: 'p1', name: 'Rond', volumeFormula: 'round' }],
  machines: [{ id: 'm1', name: 'Draaibank', machineRatePerHour: 60, operatorRatePerHour: 0 } as never],
}

function artikel(partial: Partial<Article>): Article {
  return {
    id: 'ART-1', naam: 'Testartikel', klant: null, relatieId: null, contactId: null,
    tekening: null, rev: null, drawingPath: null, photoPath: null, recipe: null,
    operations: [], notes: { workholding: '', general: '' }, attachments: [],
    estimate: null, locatie: null, currentStock: 0, minStock: null, maxStock: null,
    createdAt: '', updatedAt: '',
    ...partial,
  } as Article
}

/** Eén machinestap van 60 minuten insteltijd, verder niets. */
const setupOnly = artikel({
  estimate: {
    marginPct: 25,
    updatedAt: '',
    nodes: [{ id: 'n1', type: 'machine', name: 'Draaibank', machineId: 'm1', setupMin: 60, steps: [] }],
  },
})

describe('kostprijsVoor', () => {
  it('verdeelt insteltijd over het aantal — 10 stuks is per stuk goedkoper dan 1', () => {
    const bij1 = kostprijsVoor(setupOnly, bronnen, 1)
    const bij10 = kostprijsVoor(setupOnly, bronnen, 10)
    expect(bij1).toBeGreaterThan(0)
    expect(bij10).toBeLessThan(bij1)
    // Dit is precies waarom de prijs bij het gevraagde aantal berekend moet
    // worden en niet bij 1: anders staat er tienvoudige insteltijd op de offerte.
    expect(bij10).toBeCloseTo(bij1 / 10, 4)
  })

  it('geeft 0 zonder calculatie', () => {
    expect(kostprijsVoor(artikel({ estimate: null }), bronnen)).toBe(0)
  })

  it('geeft 0 in plaats van te klappen op een kapotte calculatie', () => {
    const stuk = artikel({
      estimate: { marginPct: 20, updatedAt: '', nodes: [{ id: 'n', type: 'machine', name: 'X', machineId: 'bestaat-niet', setupMin: 10, steps: [] }] },
    })
    expect(() => kostprijsVoor(stuk, bronnen)).not.toThrow()
  })
})

describe('prijsVoor', () => {
  it('rekent de marge uit de calculatie door en rondt op centen af', () => {
    const p = prijsVoor(setupOnly, bronnen, 1)
    expect(p.marge).toBe(25)
    expect(p.verkoopprijs).toBeCloseTo(Math.round(p.kostprijs * 1.25 * 100) / 100, 6)
    expect(Number.isInteger(p.verkoopprijs * 100)).toBe(true)
  })

  it('valt terug op 20% marge als de calculatie er geen noemt', () => {
    const zonder = artikel({ estimate: { marginPct: undefined as never, updatedAt: '', nodes: [] } })
    expect(prijsVoor(zonder, bronnen).marge).toBe(20)
  })
})

describe('bewerkingenVan', () => {
  const MACHINES = [
    { id: 'm1', name: 'DMG 450TC EcoLine' },
    { id: 'm2', name: 'Draaibank' },
  ]

  it('geeft de machinenamen, zonder dubbelen', () => {
    const a = artikel({
      estimate: {
        marginPct: 20, updatedAt: '',
        nodes: [
          { id: '1', type: 'machine', name: 'DMG 450TC EcoLine', machineId: 'm1', steps: [] },
          { id: '2', type: 'machine', name: 'Draaibank', machineId: 'm2', steps: [] },
          { id: '3', type: 'machine', name: 'DMG 450TC EcoLine', machineId: 'm1', steps: [] },
          { id: '4', type: 'material', name: 'Staf', steps: [] },
        ],
      },
    })
    expect(bewerkingenVan(a, MACHINES)).toEqual(['DMG 450TC EcoLine', 'Draaibank'])
  })

  it('neemt de naam uit de machinelijst, niet die van de knoop', () => {
    // Dit is waar het om gaat: de naam op de stap moet een bestaande machine
    // benoemen, anders kan de terminal er niet op filteren en kan de planning
    // hem niet aan een machine hangen. Een knoop die nog "Draaien" heet of een
    // machine die hernoemd is mag dat niet breken.
    const a = artikel({
      estimate: {
        marginPct: 20, updatedAt: '',
        nodes: [{ id: '1', type: 'machine', name: 'Draaien', machineId: 'm1', steps: [] }],
      },
    })
    expect(bewerkingenVan(a, MACHINES)).toEqual(['DMG 450TC EcoLine'])
  })

  it('dedupliceert op de opgeloste naam, niet op die van de knoop', () => {
    // Twee knopen met verschillende namen op dezelfde machine zijn één
    // bewerking; zonder dit stonden er twee identieke stappen op de order.
    const a = artikel({
      estimate: {
        marginPct: 20, updatedAt: '',
        nodes: [
          { id: '1', type: 'machine', name: 'Voordraaien', machineId: 'm1', steps: [] },
          { id: '2', type: 'machine', name: 'Nadraaien', machineId: 'm1', steps: [] },
        ],
      },
    })
    expect(bewerkingenVan(a, MACHINES)).toEqual(['DMG 450TC EcoLine'])
  })

  it('houdt de naam van de knoop als de machine niet te herleiden is', () => {
    // Uitbesteed of een verwijderde machine: een bewerking zonder naam is
    // erger dan een bewerking met de verkeerde.
    const a = artikel({
      estimate: {
        marginPct: 20, updatedAt: '',
        nodes: [
          { id: '1', type: 'machine', name: 'Slijpen', machineId: null, steps: [] },
          { id: '2', type: 'machine', name: 'Zagen', machineId: 'weg', steps: [] },
        ],
      },
    })
    expect(bewerkingenVan(a, MACHINES)).toEqual(['Slijpen', 'Zagen'])
  })

  it('geeft een lege lijst zonder calculatie', () => {
    expect(bewerkingenVan(artikel({ estimate: null }), MACHINES)).toEqual([])
  })
})

describe('materiaalVan', () => {
  it('toont profiel en kwaliteit, en "—" zonder recept', () => {
    const a = artikel({ recipe: { profileId: 'p1', gradeId: 'g1' } as never })
    expect(materiaalVan(a, bronnen)).toBe('Rond · S235')
    expect(materiaalVan(artikel({ recipe: null }), bronnen)).toBe('—')
  })
})
