import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { unzipSync, strFromU8 } from 'fflate'

// De map moet vaststaan vóór config geladen wordt.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verbeterpunten-'))
process.env.UPLOADS_DIR = tmp
const { verbeterpuntenMarkdown, bestandVoor, bewaarSchermafbeelding, verwijderSchermafbeelding, maakExportZip } = await import('../verbeterpunten')
const { waaromNietVerbeterpuntenExporteren, CreateVerbeterpuntSchema } = await import('@stockmanager/shared')

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const basis = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Kolomkop klopt niet bij een exoot',
  createdAt: new Date('2026-10-24T19:40:00Z'),
  createdByName: 'Addy',
  paginaUrl: '/artikelen/ART-0002',
  paginaNaam: 'Beugel 250',
  context: {
    scherm: { breedte: 1920, hoogte: 1080, schaal: 1.25 },
    browser: 'Edge 130 · Windows',
    schermafbeelding: 'nagebouwd' as const,
    fouten: [{ tijd: '2026-10-24T19:39:00.000Z', titel: 'Opslaan mislukt', tekst: 'De server is niet\nbereikbaar' }],
  },
  afbeelding: 'schermafbeeldingen/01.png',
}

describe('verbeterpuntenMarkdown', () => {
  it('zet alles erin wat meeging, in Nederlandse tijd', () => {
    const md = verbeterpuntenMarkdown([basis], new Date('2026-10-24T20:00:00Z'))
    expect(md).toContain('Export van 24-10-2026 22:00 · 1 open punt.')
    expect(md).toContain('## 1. Kolomkop klopt niet bij een exoot')
    expect(md).toContain('- **Pagina:** Beugel 250 (`/artikelen/ART-0002`)')
    expect(md).toContain('- **Gemeld door:** Addy, 24-10-2026 21:40')
    expect(md).toContain('- **Scherm:** 1920 × 1080 bij 125 %, Edge 130 · Windows')
    expect(md).toContain('`schermafbeeldingen/01.png` (door de browser nagetekend')
    // Een foutmelding over meerdere regels blijft één regel in de lijst.
    expect(md).toContain('  - 21:39 Opslaan mislukt: De server is niet bereikbaar')
    expect(md).toContain(`- **Id:** \`${basis.id}\``)
  })

  it('laat weg wat er niet is, en noemt de operator op de terminal', () => {
    const md = verbeterpuntenMarkdown([{
      ...basis, paginaNaam: null, afbeelding: null,
      context: { schermafbeelding: 'geen', fouten: [], operator: 'Jan' },
    }, { ...basis, context: null }], new Date('2026-10-24T20:00:00Z'))
    expect(md).toContain('2 open punten.')
    expect(md).toContain('- **Pagina:** /artikelen/ART-0002\n')
    expect(md).toContain('- **Gemeld door:** Addy (aan de machine: Jan), ')
    expect(md.match(/Schermafbeelding/g)?.length).toBe(1)
    expect(md).not.toContain('Foutmeldingen')
    expect(md).not.toContain('**Scherm:**')
  })

  it('kort een lange zin in voor de kop en citeert hem dan volledig', () => {
    const lang = 'Als we een bewerking toevoegen aan een machine moeten we eerst de placeholder tekst weghalen, dit moet echt placeholder tekst worden'
    const md = verbeterpuntenMarkdown([{ ...basis, title: `${lang}\nTweede regel` }], new Date())
    expect(md).toMatch(/## 1\. .{87}…\n/)
    expect(md).toContain(`> ${lang}\n> Tweede regel`)
  })
})

describe('schermafbeelding op schijf', () => {
  it('bewaart onder de eigen map en verwijdert weer', () => {
    const pad = bewaarSchermafbeelding(basis.id, Buffer.from('png'), 'image/png')
    expect(pad).toBe(`/uploads/verbeterpunten/${basis.id}.png`)
    expect(fs.readFileSync(path.join(tmp, 'verbeterpunten', `${basis.id}.png`), 'utf8')).toBe('png')
    verwijderSchermafbeelding(pad)
    expect(fs.existsSync(path.join(tmp, 'verbeterpunten', `${basis.id}.png`))).toBe(false)
  })

  it('weigert iets anders dan een afbeelding', () => {
    expect(() => bewaarSchermafbeelding(basis.id, Buffer.from('<html>'), 'text/html')).toThrow(/png-, jpg- of webp/)
  })

  it('komt nooit buiten de eigen map', () => {
    expect(bestandVoor('/uploads/verbeterpunten/../../etc/passwd')).toBeNull()
    expect(bestandVoor('/uploads/drawings/x.pdf')).toBeNull()
    expect(bestandVoor('/uploads/verbeterpunten/')).toBeNull()
    expect(bestandVoor(null)).toBeNull()
  })
})

describe('maakExportZip', () => {
  beforeAll(() => { bewaarSchermafbeelding(basis.id, Buffer.from('beeld'), 'image/png') })

  it('nummert de afbeeldingen zoals de tekst, en slaat een ontbrekend bestand over', () => {
    const zip = unzipSync(maakExportZip([
      { ...basis, schermafbeelding: '/uploads/verbeterpunten/bestaat-niet.png' },
      { ...basis, schermafbeelding: `/uploads/verbeterpunten/${basis.id}.png` },
    ], new Date()))
    expect(Object.keys(zip).sort()).toEqual(['schermafbeeldingen/02.png', 'verbeterpunten.md'])
    expect(strFromU8(zip['schermafbeeldingen/02.png'])).toBe('beeld')
    const md = strFromU8(zip['verbeterpunten.md'])
    expect(md).toContain('`schermafbeeldingen/02.png`')
    expect(md.match(/Schermafbeelding/g)?.length).toBe(1)
  })
})

describe('voorwaarden en invoer', () => {
  it('exporteren kan pas met minstens één open punt', () => {
    expect(waaromNietVerbeterpuntenExporteren(0)).toMatch(/geen open verbeterpunten/)
    expect(waaromNietVerbeterpuntenExporteren(3)).toBeNull()
  })

  it('een lege zin is geen verbeterpunt', () => {
    const r = CreateVerbeterpuntSchema.safeParse({ zin: '   ', paginaUrl: '/voorraad', context: {} })
    expect(r.success).toBe(false)
    const ok = CreateVerbeterpuntSchema.parse({ zin: ' Dit klopt niet ', paginaUrl: '/voorraad', context: {} })
    expect(ok).toMatchObject({ zin: 'Dit klopt niet', paginaNaam: null, context: { schermafbeelding: 'geen', fouten: [] } })
  })
})
