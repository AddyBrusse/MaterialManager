import { describe, it, expect } from 'vitest'
import { laadMetHerhaling } from '../laad-met-herhaling'

const fout = (wat: string) => ({ wat, aantalLokaal: 1, fout: new Error('TIMEOUT') })
const geenWacht = { wacht: async () => {} }

/** Een laadtaak die de eerste `keren` keer mislukt en daarna lukt. */
function taak(wat: string, keren: number) {
  let n = 0
  const t = async () => (n++ < keren ? fout(wat) : null)
  return Object.assign(t, { aanroepen: () => n })
}

describe('laadMetHerhaling', () => {
  // 2026-09-30: bij het opstarten faalden machines en artikelen op de 3 s,
  // na F5 was alles goed. Dat hoort geen melding te geven.
  it('meldt niets als een tweede poging lukt, en vraagt alleen opnieuw wat mislukte', async () => {
    const machines = taak('machines', 1)
    const projecten = taak('projecten', 0)
    const fouten = await laadMetHerhaling([machines, projecten], geenWacht)
    expect(fouten).toEqual([])
    expect(machines.aanroepen()).toBe(2)
    expect(projecten.aanroepen()).toBe(1)
  })

  it('geeft op na de laatste poging, met alleen wat dan nog mislukt', async () => {
    const machines = taak('machines', 99)
    const artikelen = taak('artikelen', 1)
    const fouten = await laadMetHerhaling([machines, artikelen], geenWacht)
    expect(fouten.map((f) => f.wat)).toEqual(['machines'])
    expect(machines.aanroepen()).toBe(3)
  })

  it('wacht steeds langer, en ververst na elke ronde', async () => {
    const gewacht: number[] = []
    let rondes = 0
    await laadMetHerhaling([taak('machines', 99)], {
      wacht: async (ms) => { gewacht.push(ms) },
      naRonde: () => { rondes++ },
    })
    expect(gewacht).toEqual([2000, 4000])
    expect(rondes).toBe(3)
  })

  it('stopt als het scherm weg is (popout gesloten)', async () => {
    const machines = taak('machines', 99)
    await laadMetHerhaling([machines], { ...geenWacht, gestopt: () => true })
    expect(machines.aanroepen()).toBe(1)
  })

  it('telt een gewone uitkomst (bedrijfsgegevens) niet als fout', async () => {
    expect(await laadMetHerhaling([async () => ({ naam: 'Boers' })], geenWacht)).toEqual([])
  })
})
