import { describe, it, expect } from 'vitest'
import {
  plusWerkdagen, nodigVoorProductie, bestelUiterlijk, verwachtBinnen, planVoor, groepVoor, meldingVoor, vraagtVandaag,
} from '@stockmanager/shared'

// 2026-10-07 is een woensdag.
describe('werkdagen', () => {
  it('slaat het weekend over', () => {
    expect(plusWerkdagen('2026-10-09', 1)).toBe('2026-10-12') // vr → ma
    expect(plusWerkdagen('2026-10-12', -1)).toBe('2026-10-09') // ma → vr
    expect(plusWerkdagen('2026-10-07', 5)).toBe('2026-10-14')
    expect(plusWerkdagen('2026-10-07', 0)).toBe('2026-10-07')
  })
})

describe('nodig voor productie', () => {
  it('de vroegst geplande stap die nog niet gereed is', () => {
    const n = nodigVoorProductie([
      { geplandDatum: '2026-10-20', machine: 'Mazak' },
      { geplandDatum: '2026-10-08', machine: 'Zaag', gereedOp: '2026-10-06' },
      { geplandDatum: '2026-10-15', machine: 'Draaibank', geplandMachine: 'DMG 450' },
    ], '2026-11-20')
    expect(n).toEqual({ datum: '2026-10-15', bron: 'productie', machine: 'DMG 450' })
  })
  it('zonder planning: levering min 2 werkdagen', () => {
    expect(nodigVoorProductie([{ geplandDatum: null }], '2026-10-13')).toEqual({ datum: '2026-10-09', bron: 'levering', machine: null })
  })
  it('zonder planning en zonder levertijd: geen datum', () => {
    expect(nodigVoorProductie([], null).datum).toBeNull()
  })
})

describe('uiterlijk bestellen en verwacht', () => {
  it('nodig − levertijd − marge, in werkdagen', () => {
    expect(bestelUiterlijk('2026-10-16', 5, 2)).toBe('2026-10-07')
    expect(bestelUiterlijk(null, 5, 2)).toBeNull()
  })
  it('een aangepaste leverdatum gaat voor', () => {
    expect(verwachtBinnen('2026-10-01', 6, null)).toBe('2026-10-09')
    expect(verwachtBinnen('2026-10-01', 6, '2026-10-08')).toBe('2026-10-08')
    expect(verwachtBinnen('2026-10-01', null, null)).toBeNull()
  })
})

describe('stand', () => {
  const v = '2026-10-07'
  it('wacht, nu bestellen, te laat besteld', () => {
    expect(planVoor({ status: 'te_bestellen', nodig: '2026-10-20', levertijdDagen: 3, verwacht: null }, v, 2).stand).toBe('wacht')
    expect(planVoor({ status: 'te_bestellen', nodig: '2026-10-16', levertijdDagen: 5, verwacht: null }, v, 2).stand).toBe('nu_bestellen')
    const laat = planVoor({ status: 'aangevraagd', nodig: '2026-10-09', levertijdDagen: 5, verwacht: null }, v, 2)
    expect(laat.stand).toBe('te_laat_besteld')
    expect(laat.tekst).toMatch(/had 30-09 besteld/)
  })
  it('zonder datum wacht hij', () => {
    expect(planVoor({ status: 'te_bestellen', nodig: null, levertijdDagen: null, verwacht: null }, v, 2).tekst).toMatch(/geen datum/)
  })
  it('onderweg: op tijd of te laat', () => {
    expect(planVoor({ status: 'besteld', nodig: '2026-10-10', levertijdDagen: 6, verwacht: '2026-10-09' }, v, 2).stand).toBe('onderweg_op_tijd')
    const p = planVoor({ status: 'besteld', nodig: '2026-10-08', levertijdDagen: 6, verwacht: '2026-10-09' }, v, 2)
    expect(p).toMatchObject({ stand: 'komt_te_laat', dagenTeLaat: 1, tekst: 'komt 1 dag te laat' })
  })
  it('alleen wat vandaag iets vraagt telt', () => {
    expect(vraagtVandaag('wacht')).toBe(false)
    expect(vraagtVandaag('onderweg_op_tijd')).toBe(false)
    expect(vraagtVandaag('komt_te_laat')).toBe(true)
    expect(vraagtVandaag('te_laat_besteld')).toBe(true)
  })
})

describe('groep per leverancier', () => {
  it('franco: wat er nog bij moet', () => {
    const g = groepVoor([
      { totaal: 100.2, plan: { stand: 'wacht', uiterlijk: '2026-10-12' } },
      { totaal: 86.2, plan: { stand: 'wacht', uiterlijk: '2026-10-09' } },
      { totaal: null, plan: { stand: 'wacht', uiterlijk: null } },
    ], 250)
    expect(g).toMatchObject({ totaal: 186.4, nogTotFranco: 63.6, uiterlijk: '2026-10-09', vandaag: false, zonderPrijs: 1 })
  })
  it('zonder grens geen franco; een urgente regel maakt de groep urgent', () => {
    const g = groepVoor([{ totaal: 10, plan: { stand: 'nu_bestellen', uiterlijk: '2026-10-07' } }], null)
    expect(g.nogTotFranco).toBeNull()
    expect(g.vandaag).toBe(true)
  })
})

describe('melding', () => {
  it('komt te laat noemt order en leverancier', () => {
    const m = meldingVoor({
      id: 'r', materiaal: 'C45 Rond Ø50', projectId: 'PRJ-2026-011', leverancierNaam: 'ArcelorMittal', inkooporderId: 'INK-2026-006',
      nodig: { datum: '2026-10-08', bron: 'productie', machine: 'DMG 450' },
      plan: { stand: 'komt_te_laat', uiterlijk: null, verwacht: '2026-10-09', dagenTeLaat: 1, tekst: '' },
    })
    expect(m?.titel).toBe('Komt te laat: C45 Rond Ø50 voor PRJ-2026-011')
    expect(m?.tekst).toBe('INK-2026-006 verwacht 09-10, nodig voor DMG 450 op 08-10. Bel ArcelorMittal.')
  })
  it('wacht geeft geen melding', () => {
    expect(meldingVoor({
      id: 'r', materiaal: 'x', projectId: null, leverancierNaam: null, inkooporderId: null,
      nodig: { datum: null, bron: null, machine: null }, plan: { stand: 'wacht', uiterlijk: null, verwacht: null, dagenTeLaat: null, tekst: '' },
    })).toBeNull()
  })
})
