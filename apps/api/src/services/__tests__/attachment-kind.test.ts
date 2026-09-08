import { describe, it, expect } from 'vitest'
import { classifyAttachment, hoortBij } from '../attachment-kind'

describe('classifyAttachment', () => {
  it('herkent het handelsdocument aan zijn naam', () => {
    expect(classifyAttachment('Purchase order_2604307_20260904_09-42.pdf')).toBe('document')
    expect(classifyAttachment('Inkooporder 12345.pdf')).toBe('document')
    expect(classifyAttachment('Offerteaanvraag RFQ-887.pdf')).toBe('document')
    expect(classifyAttachment('Algemene voorwaarden.pdf')).toBe('document')
  })

  it('herkent een tekening aan nummer en extensie', () => {
    expect(classifyAttachment('2604307-1-2615-0091-0530-1_20260904-0942.dwg')).toBe('tekening')
    expect(classifyAttachment('2026077-001.STEP')).toBe('tekening')
    expect(classifyAttachment('123456_rev B.pdf')).toBe('tekening')
  })

  it('houdt de rest erbuiten', () => {
    expect(classifyAttachment('image001.png')).toBe('overig')
    expect(classifyAttachment('smime.p7s')).toBe('overig')
    // Geen nummer erin: een document zonder herkenbare naam, geen tekening.
    expect(classifyAttachment('scan.pdf')).toBe('overig')
    // Wel een nummer, maar een bestandstype dat hier geen onderdeel aanduidt.
    expect(classifyAttachment('order 12345.xlsx')).toBe('overig')
  })
})

describe('hoortBij', () => {
  it('herkent ons tekeningnummer in de aanduiding van de klant', () => {
    expect(hoortBij('2604307-1-2615-0091-0530-1_20260904-0942.dwg', '2615-0091-0530')).toBe(true)
  })

  it('trekt zich niets aan van punten, streepjes en underscores', () => {
    expect(hoortBij('123.456.stp', '123-456')).toBe(true)
  })

  it('haalt geen ander onderdeel erbij dat één cijfer verschilt', () => {
    expect(hoortBij('2604307-1-2615-0091-0530-1.dwg', '2615-0090-0530')).toBe(false)
  })

  it('koppelt niet op een paar tekens', () => {
    expect(hoortBij('123.stp', '123')).toBe(false)
  })

  it('is onwaar zonder tekeningnummer', () => {
    expect(hoortBij('van-alles.stp', null)).toBe(false)
  })
})
