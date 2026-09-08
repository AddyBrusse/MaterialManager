import { describe, it, expect } from 'vitest'
import { voortgang, voortgangTekst } from '../voortgang'

describe('voortgang', () => {
  it('begint op nul', () => {
    expect(voortgang(0, 40)).toBe(0)
  })

  it('staat halverwege de voorspelling op de helft van 90%', () => {
    expect(voortgang(20, 40)).toBeCloseTo(0.45)
  })

  it('staat op 90% op het voorspelde moment — niet op 100%', () => {
    expect(voortgang(40, 40)).toBeCloseTo(0.9)
  })

  it('kruipt door bij overtijd maar komt nooit aan', () => {
    expect(voortgang(80, 40)).toBeGreaterThan(0.9)
    expect(voortgang(400, 40)).toBeLessThan(1)
    expect(voortgang(4000, 40)).toBeLessThan(1)
  })

  it('loopt zonder voorspelling langzaam op zonder eindpunt te beloven', () => {
    expect(voortgang(45, null)).toBeCloseTo(0.495, 2)
    expect(voortgang(1000, null)).toBeLessThan(1)
  })

  it('gaat niet stuk op een negatieve of rare invoer', () => {
    expect(voortgang(-5, 40)).toBe(0)
    expect(voortgang(10, 0)).toBeGreaterThan(0)
  })
})

describe('voortgangTekst', () => {
  it('zegt eerlijk dat we het nog niet weten', () => {
    expect(voortgangTekst(10, null)).toMatch(/weten we nog niet/)
  })

  it('noemt de resterende tijd en waarop die rust', () => {
    const t = voortgangTekst(10, { verwachtSeconden: 40, bovengrensSeconden: 60, gebaseerdOp: 12 })
    expect(t).toMatch(/nog ongeveer 30 s/)
    expect(t).toMatch(/12 eerdere mails/)
  })

  it('geeft toe dat het langer duurt in plaats van te blijven aftellen', () => {
    const t = voortgangTekst(90, { verwachtSeconden: 40, bovengrensSeconden: 60, gebaseerdOp: 12 })
    expect(t).toMatch(/langer dan/)
  })
})
