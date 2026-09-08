import { describe, it, expect } from 'vitest'
import { looksLikeMsg, parseMsg } from '../msg-parse'

describe('looksLikeMsg', () => {
  it('herkent een OLE2 compound file aan de magic bytes', () => {
    const ole2 = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)])
    expect(looksLikeMsg(ole2)).toBe(true)
  })

  it('wijst andere bestanden af, ook als ze .msg heten', () => {
    // Chrome geeft geen MIME-type bij een gesleepte mail (gemeten, zie
    // features/60-mail-import.md §2.1), dus dit is de enige echte controle.
    expect(looksLikeMsg(Buffer.from('%PDF-1.7\n'))).toBe(false)
    expect(looksLikeMsg(Buffer.from('ISO-10303-21;\n'))).toBe(false)  // STEP
    expect(looksLikeMsg(Buffer.alloc(4))).toBe(false)                 // te kort
    expect(looksLikeMsg(Buffer.alloc(0))).toBe(false)
  })
})

describe('parseMsg', () => {
  it('weigert een bestand dat geen .msg is met een leesbare melding', () => {
    expect(() => parseMsg(Buffer.from('%PDF-1.7\n'))).toThrow(/geen Outlook-bericht/)
  })
})
