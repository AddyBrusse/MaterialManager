import { describe, it, expect } from 'vitest'
import {
  waaromNietInkooporder, waaromNietInkoopWijzigen, waaromNietInkoopVersturen, waaromNietInkoopIntrekken,
  waaromNietOntvangen, openStuks, statusNaOntvangst, waaromNietBestelRegelWijzigen, waaromNietKiezen,
  type BestelKeuze,
} from '@stockmanager/shared'

const keuze: BestelKeuze = { leverancierId: 't', leverancierNaam: 'Tata', bron: 'prijslijst', antwoordId: null, totaal: 10, uitleg: '', levertijdDagen: null, gekozenOp: '', gekozenDoor: null }
const regel = (p: object = {}) => ({ materiaal: 'C45 Rond Ø40', status: 'aangevraagd' as const, keuze, inkooporder: null, ...p })
const order = (p: object = {}) => ({ id: 'INK-2026-001', status: 'verzonden' as const, email: 'a@b.nl', leverancierNaam: 'Tata', regels: [{ referentie: 'INK-2026-001.1', stuks: 4, ontvangenStuks: 0 }], ...p })

describe('inkooporder maken', () => {
  it('zonder gekozen leverancier zegt waar je kiest', () => {
    expect(waaromNietInkooporder([regel({ keuze: null })])).toMatch(/geen leverancier gekozen/)
  })
  it('niet twee keer op een order', () => {
    expect(waaromNietInkooporder([regel({ inkooporder: { id: 'INK-2026-001', status: 'concept' } })])).toMatch(/INK-2026-001/)
  })
  it('met keuze kan het', () => {
    expect(waaromNietInkooporder([regel()])).toBeNull()
  })
})

describe('verstuurd ligt vast', () => {
  it('concept mag wijzigen, verstuurd niet', () => {
    expect(waaromNietInkoopWijzigen({ id: 'X', status: 'concept' })).toBeNull()
    expect(waaromNietInkoopWijzigen({ id: 'X', status: 'verzonden' })).toMatch(/Trek hem in/)
  })
  it('versturen zonder e-mailadres', () => {
    expect(waaromNietInkoopVersturen(order({ email: null }))).toMatch(/Relaties → Tata/)
  })
  it('intrekken alleen als er niets binnen is', () => {
    expect(waaromNietInkoopIntrekken(order())).toBeNull()
    expect(waaromNietInkoopIntrekken(order({ regels: [{ referentie: 'INK-2026-001.1', stuks: 4, ontvangenStuks: 1 }] }))).toMatch(/al iets ontvangen/)
    expect(waaromNietInkoopIntrekken(order({ status: 'concept' }))).toMatch(/concept/)
  })
  it('een regel op een concept wijzig je niet en kies je niet opnieuw', () => {
    const r = regel({ inkooporder: { id: 'INK-2026-002', status: 'concept' } })
    expect(waaromNietBestelRegelWijzigen(r)).toMatch(/Haal hem daar eerst af/)
    expect(waaromNietKiezen(r, { soort: 'geen' })).toMatch(/INK-2026-002/)
  })
})

describe('ontvangen', () => {
  const r = { referentie: 'INK-2026-001.1', stuks: 4, ontvangenStuks: 1 }
  it('deels, maar nooit meer dan er open staat', () => {
    expect(openStuks(r)).toBe(3)
    expect(waaromNietOntvangen(order(), r, 3)).toBeNull()
    expect(waaromNietOntvangen(order(), r, 4)).toMatch(/nog 3 stuks open/)
    expect(waaromNietOntvangen(order(), r, 0)).toMatch(/minstens 1/)
  })
  it('een concept kan nog niets binnenkrijgen', () => {
    expect(waaromNietOntvangen(order({ status: 'concept' }), r, 1)).toMatch(/Verstuur hem eerst/)
  })
  it('alles binnen → ontvangen', () => {
    expect(statusNaOntvangst(4, 3)).toBe('besteld')
    expect(statusNaOntvangst(4, 4)).toBe('ontvangen')
  })
})
