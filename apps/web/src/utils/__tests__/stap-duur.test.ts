import { describe, it, expect } from 'vitest'
import type { ProductieOrder, ProductieStap } from '@stockmanager/shared'
import type { Article } from '../../api/articles'
import { berekenStapMin, receptMachines, receptMachineVoorStap } from '../planningUtils'

const machines = [{ id: 'zaag', name: 'Amada Zaag' }, { id: 'dmg', name: 'DMG 450TC' }]

// De bolt M24 uit PRJ-2026-013: zagen 20 min setup + 2 min/st, draaien 60 + 10 min/st.
const bolt = {
  id: 'bolt',
  estimate: {
    marginPct: 0, updatedAt: '',
    nodes: [
      { id: 'm', type: 'material', name: 'C45' },
      { id: 'z', type: 'machine', name: 'Zaag', machineId: 'zaag', setupMin: 20, steps: [{ id: 's', name: 'zagen', cycleMin: 2 }] },
      { id: 'd', type: 'machine', name: 'DMG', machineId: 'dmg', setupMin: 60, steps: [{ id: 't', name: 'draaien', cycleMin: 6 }, { id: 'u', name: 'afsteken', cycleMin: 4 }] },
    ],
  },
} as unknown as Article

const stap = (i: number, machine: string): ProductieStap =>
  ({ id: `st${i}`, volgorde: i + 1, naam: machine, machine, gereedOp: null, gereedDoor: null })

const order = (stappen: ProductieStap[], qty = 80): ProductieOrder =>
  ({ id: 'o', projectId: 'p', offerteRegelId: 'r', artikelId: 'bolt', artikelNaam: 'Bolt', qty, eenheid: 'st', aantalGereed: 0, stappen, status: 'gepland' } as unknown as ProductieOrder)

describe('berekenStapMin', () => {
  const stappen = [stap(0, 'Amada Zaag'), stap(1, 'DMG 450TC')]

  it('de bolt: zagen = 1× setup 20 min + 80 × 2 min = 3 uur, niet een deel van het totaal', () => {
    expect(berekenStapMin(stappen[0], order(stappen), [bolt], machines)).toEqual({ min: 180, isPlaceholder: false })
  })

  it('elke stap de tijd van zijn eigen machine', () => {
    expect(berekenStapMin(stappen[1], order(stappen), [bolt], machines).min).toBe(60 + 80 * 10)
  })

  it('setup telt één keer, ook bij een groot aantal', () => {
    expect(berekenStapMin(stappen[0], order(stappen, 1000), [bolt], machines).min).toBe(20 + 1000 * 2)
  })

  it('op naam als de volgorde afwijkt', () => {
    const om = [stap(0, 'DMG 450TC'), stap(1, 'Amada Zaag')]
    expect(berekenStapMin(om[1], order(om), [bolt], machines).min).toBe(180)
  })

  it('een stap die niet bij een machine in het recept hoort: een gelijk deel, zoals vroeger', () => {
    const met = [...stappen, stap(2, 'Handwerk')]
    expect(berekenStapMin(met[2], order(met), [bolt], machines).min).toBe(Math.round((180 + 860) / 3))
  })
})

describe('receptMachines', () => {
  // Draaien, zagen, nog eens zagen: twee knopen op dezelfde zaag (2026-10-23).
  const dubbel = { ...bolt, estimate: { ...bolt.estimate!, nodes: [...bolt.estimate!.nodes, { id: 'z2', type: 'machine', name: 'Zaag', machineId: 'zaag', setupMin: 5, steps: [{ id: 'x', name: 'na', cycleMin: 1 }] }] } } as unknown as Article

  it('elke machineknoop apart, ook als de machine al eerder in het recept staat', () => {
    expect(receptMachines(dubbel, machines)).toEqual([
      { naam: 'Amada Zaag', setupMin: 20, cycleMin: 2 },
      { naam: 'DMG 450TC', setupMin: 60, cycleMin: 10 },
      { naam: 'Amada Zaag', setupMin: 5, cycleMin: 1 },
    ])
  })

  it('de tweede stap op een machine krijgt de tijd van de tweede knoop', () => {
    const st = [stap(0, 'Amada Zaag'), stap(1, 'DMG 450TC'), stap(2, 'Amada Zaag')]
    expect(berekenStapMin(st[0], order(st), [dubbel], machines).min).toBe(20 + 80 * 2)
    expect(berekenStapMin(st[2], order(st), [dubbel], machines).min).toBe(5 + 80 * 1)
  })

  it('een order van vóór 2026-10-23 (één stap per machine) houdt de tijd van beide knopen', () => {
    const st = [stap(0, 'Amada Zaag'), stap(1, 'DMG 450TC')]
    expect(berekenStapMin(st[0], order(st), [dubbel], machines).min).toBe(25 + 80 * 3)
  })

  it('zonder machinelijst de naam van de knoop', () => {
    expect(receptMachines(bolt).map((m) => m.naam)).toEqual(['Zaag', 'DMG'])
    expect(receptMachineVoorStap(receptMachines(bolt), 'Amada Zaag', 0, ['Amada Zaag', 'DMG 450TC'])?.naam).toBe('Zaag')
  })
})
