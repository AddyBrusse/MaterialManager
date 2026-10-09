import { describe, it, expect } from 'vitest'
import { blokkadesVoorOngedaan, zelfdePlanning, type HerberekeningWijziging, type StapNu } from '@stockmanager/shared'

const OP = '2026-10-08T10:00:00.000Z'
const nieuw = { geplandDatum: '2026-10-09', geplandMachine: 'DMG', queuePosition: 1000, prioriteit: 2000 }
const w: HerberekeningWijziging = { stapId: 's1', projectId: 'P', orderId: 'ORD-1', oud: { geplandDatum: null, geplandMachine: null, queuePosition: null, prioriteit: null }, nieuw }
const stap = (x: Partial<StapNu> = {}): Map<string, StapNu> =>
  new Map([['s1', { id: 's1', naam: 'Draaien', volgorde: 2, gereedOp: null, gereedDoor: null, ...nieuw, ...x }]])

describe('ongedaan maken: wat houdt het tegen', () => {
  it('niets gebeurd: geen blokkades', () => {
    expect(blokkadesVoorOngedaan([w], stap(), [], OP)).toEqual([])
  })

  it('daarna gestart: blokkade met de gemeten tijd, want die gaat verloren bij wissen', () => {
    const b = blokkadesVoorOngedaan([w], stap(), [{ id: 'k', stapId: 's1', gestartOp: '2026-10-08T10:14:00.000Z', machineNaam: 'DMG', door: 'Jan', seconden: 720 }], OP)
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ soort: 'gestart', seconden: 720 })
    expect(b[0].tekst).toMatch(/ORD-1 stap 2 \(Draaien\) is om .* gestart op DMG door Jan \(0:12 gemeten\)/)
  })

  it('al gestart vóór de planning: geen blokkade, dat stond toen ook zo', () => {
    expect(blokkadesVoorOngedaan([w], stap(), [{ id: 'k', stapId: 's1', gestartOp: '2026-10-08T09:00:00.000Z', machineNaam: null, door: null, seconden: 60 }], OP)).toEqual([])
  })

  it('daarna gereedgemeld', () => {
    const b = blokkadesVoorOngedaan([w], stap({ gereedOp: '2026-10-08T11:00:00.000Z', gereedDoor: 'Piet' }), [], OP)
    expect(b.map((x) => x.soort)).toEqual(['gereed'])
    expect(b[0].tekst).toMatch(/door Piet/)
  })

  it('daarna met de hand verplaatst', () => {
    expect(blokkadesVoorOngedaan([w], stap({ geplandMachine: 'Doosan' }), [], OP).map((x) => x.soort)).toEqual(['gewijzigd'])
  })

  it('een stap die niet meer bestaat blokkeert niet', () => {
    expect(blokkadesVoorOngedaan([w], new Map(), [], OP)).toEqual([])
  })

  it('getallen uit JSON tellen met een kleine marge als gelijk', () => {
    expect(zelfdePlanning(nieuw, { ...nieuw, queuePosition: 1000.0000001 })).toBe(true)
    expect(zelfdePlanning(nieuw, { ...nieuw, prioriteit: null })).toBe(false)
  })
})

describe('materiaal verwacht voor de planning', async () => {
  const { materiaalVerwachtVoor } = await import('@stockmanager/shared')
  const order = { projectId: 'P', offerteRegelId: 'R' }
  const regel = (x: object) => ({ projectId: 'P', offerteRegelId: 'R', status: 'besteld', keuzeLevertijdDagen: null, inkoopRegels: [], ...x })
  it('verstuurd: de doorgegeven datum, anders verstuurd + levertijd', () => {
    expect(materiaalVerwachtVoor(order, [regel({ inkoopRegels: [{ levertijdDagen: 5, verwachtDatum: '2026-10-20', inkooporder: { status: 'verzonden', verzondenOp: '2026-10-01' } }] })], '2026-10-09'))
      .toEqual({ verwacht: '2026-10-20', onbekend: false })
    expect(materiaalVerwachtVoor(order, [regel({ inkoopRegels: [{ levertijdDagen: 5, verwachtDatum: null, inkooporder: { status: 'verzonden', verzondenOp: '2026-10-05' } }] })], '2026-10-09').verwacht)
      .toBe('2026-10-12')
  })
  it('nog niet besteld: vandaag + levertijd van de gekozen leverancier; zonder levertijd onbekend', () => {
    expect(materiaalVerwachtVoor(order, [regel({ status: 'te_bestellen', keuzeLevertijdDagen: 3 })], '2026-10-09').verwacht).toBe('2026-10-14')
    expect(materiaalVerwachtVoor(order, [regel({ status: 'te_bestellen' })], '2026-10-09')).toEqual({ verwacht: null, onbekend: true })
  })
  it('alleen de bestelregels van deze orderregel, en de laatste datum telt', () => {
    expect(materiaalVerwachtVoor(order, [regel({ offerteRegelId: 'X', keuzeLevertijdDagen: 1 }), regel({ keuzeLevertijdDagen: 10, status: 'te_bestellen' }), regel({ keuzeLevertijdDagen: 2, status: 'te_bestellen' })], '2026-10-09').verwacht)
      .toBe('2026-10-23')
  })
})
