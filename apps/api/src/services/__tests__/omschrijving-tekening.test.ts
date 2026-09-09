import { describe, it, expect } from 'vitest'
import { schoonOmschrijving } from '../ai-extract'

// Een omschrijving is geen samenvatting van de regel: het tekeningnummer, de
// revisie en het positienummer hebben hun eigen veld. Staan ze toch in de
// omschrijving, dan staat het nummer op twee plekken — of alleen daar, en dan
// vindt het koppelen van tekeningbestanden (dat op het nummer matcht) niets meer.
describe('schoonOmschrijving', () => {
  it('haalt het tekeningnummer uit een samengevatte regel', () => {
    expect(schoonOmschrijving('Pos. 10 2615-0090-0530 rev B Steunbeugel RVS 304', '2615-0090-0530', 'B'))
      .toBe('Steunbeugel RVS 304')
  })

  it('herkent het nummer ook met andere scheidingstekens', () => {
    expect(schoonOmschrijving('2615.0090.0530 Flens 80mm', '2615-0090-0530', null))
      .toBe('Flens 80mm')
  })

  it('laat een echte benaming ongemoeid', () => {
    expect(schoonOmschrijving('Steunbeugel RVS 304', '2615-0090-0530', 'B'))
      .toBe('Steunbeugel RVS 304')
  })

  it('geeft null als er alleen het nummer stond', () => {
    // Liever leeg dan het nummer nog een keer: dat is geen omschrijving.
    expect(schoonOmschrijving('2615-0090-0530', '2615-0090-0530', null)).toBeNull()
    expect(schoonOmschrijving('rev B', null, 'B')).toBeNull()
  })

  it('doet niets als er geen omschrijving is', () => {
    expect(schoonOmschrijving(null, '2615-0090-0530', 'B')).toBeNull()
  })

  it('laat een omschrijving heel als er geen tekeningnummer bekend is', () => {
    expect(schoonOmschrijving('Afstandsbus messing', null, null)).toBe('Afstandsbus messing')
  })
})
