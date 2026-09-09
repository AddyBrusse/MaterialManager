import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { pakZipUit, isZip } from '../zip-uitpakken'

function zip(inhoud: Record<string, string>): Buffer {
  const data: Record<string, Uint8Array> = {}
  for (const [naam, tekst] of Object.entries(inhoud)) data[naam] = strToU8(tekst)
  return Buffer.from(zipSync(data))
}

describe('pakZipUit', () => {
  it('haalt de bestanden eruit', () => {
    const uit = pakZipUit(zip({ '206413050_507957355_A_.stp': 'ISO-10303', 'tekening.pdf': '%PDF' }))
    expect(uit.map((f) => f.filename).sort()).toEqual(['206413050_507957355_A_.stp', 'tekening.pdf'])
    expect(uit[0].content.length).toBeGreaterThan(0)
  })

  it('houdt alleen de bestandsnaam over, ook bij mappen', () => {
    // Zo blijft het nummer waarop gekoppeld wordt vooraan staan, en kan een pad
    // nooit buiten de doelmap wijzen.
    const uit = pakZipUit(zip({ 'Tekeningen/serie 1/700123456_-_.pdf': '%PDF' }))
    expect(uit.map((f) => f.filename)).toEqual(['700123456_-_.pdf'])
  })

  it('weigert een pad dat naar buiten wijst', () => {
    const uit = pakZipUit(zip({ '../../etc/passwd': 'root:x:0:0' }))
    expect(uit.map((f) => f.filename)).toEqual(['passwd'])
  })

  it('kijkt niet in zips binnen zips', () => {
    // Komt in de praktijk niet voor en is precies de vorm waarmee een zipbom
    // zich vermenigvuldigt.
    const uit = pakZipUit(zip({ 'binnen.zip': 'PK', 'tekening-998877.pdf': '%PDF' }))
    expect(uit.map((f) => f.filename)).toEqual(['tekening-998877.pdf'])
  })

  it('geeft een lege lijst bij kapotte bytes in plaats van te klappen', () => {
    // Een onleesbare zip mag het inlezen van de mail niet laten mislukken; de
    // rest van de mail is nog steeds bruikbaar.
    expect(pakZipUit(Buffer.from('dit is geen zip'))).toEqual([])
  })

  it('herkent een zip aan zijn naam', () => {
    expect(isZip('Tekeningen.zip')).toBe(true)
    expect(isZip('TEKENINGEN.ZIP')).toBe(true)
    expect(isZip('tekening.pdf')).toBe(false)
  })
})
