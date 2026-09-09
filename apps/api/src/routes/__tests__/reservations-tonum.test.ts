import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { toNum } from '../reservations'

// De maten van een reservering staan als DECIMAL in de database en komen bij
// Prisma terug als een Decimal-object. Gaat dat als string de API uit, dan doet
// elke optelling aan de andere kant stringplakwerk: `0 + "870"` wordt "0870".
// Dat raakte de beschikbare lengte per staaf op de voorraadpagina, de totalen op
// de reserveringenpagina en het blok op de projectpagina.
describe('toNum', () => {
  it('maakt een Prisma Decimal tot een echt getal', () => {
    const d = new Prisma.Decimal('870.5')
    expect(toNum(d)).toBe(870.5)
    expect(typeof toNum(d)).toBe('number')
  })

  it('telt op als getal, niet als tekst', () => {
    const rijen = [new Prisma.Decimal('870'), new Prisma.Decimal('130')]
    expect(rijen.reduce((s, r) => s + toNum(r), 0)).toBe(1000)
  })

  it('neemt string en number ongewijzigd over', () => {
    expect(toNum('210')).toBe(210)
    expect(toNum(210)).toBe(210)
  })

  it('leest een leeg veld als nul in plaats van NaN', () => {
    expect(toNum(null)).toBe(0)
    expect(toNum(undefined)).toBe(0)
  })
})
