import { describe, it, expect, vi } from 'vitest'
import { catalogusTekst, TABELLEN } from '../assistent-catalogus'
import { dagUit, leesTabel, LeesFout, telTabel, voorwaarde } from '../assistent-lezen'

// Woensdag 28-10-2026, 10:00 in de eigen tijdzone.
const NU = new Date('2026-10-28T10:00:00')
const t = (naam: string) => TABELLEN.get(naam)!

describe('catalogus', () => {
  it('laat afgesproken velden nooit zien: niet in de tabel en niet in de tekst voor het model', () => {
    for (const [tabel, velden] of [['relaties', ['iban', 'kvk', 'btw']], ['gebruikers', ['email', 'telefoon']], ['mailImports', ['bodyText', 'bijlagen']], ['todos', ['schermafbeelding', 'context']]] as const) {
      for (const v of velden) expect(t(tabel).velden.has(v), `${tabel}.${v}`).toBe(false)
    }
    const tekst = catalogusTekst()
    expect(tekst).not.toMatch(/\biban\b|\bkvk\b|schermafbeelding|bodyText/)
    expect(t('relaties').velden.has('naam')).toBe(true)
  })

  it('techniek en instellingen staan er niet in', () => {
    const modellen = [...TABELLEN.values()].map((x) => x.model)
    for (const m of ['Company', 'UserPreference', 'Lock', 'DocSequence', 'AssistentBericht', 'AssistentGebruik']) expect(modellen).not.toContain(m)
  })

  it('kent de soort van een veld: enum, tijdstip, getal', () => {
    expect(t('todos').velden.get('priority')).toMatchObject({ soort: 'keuze', waarden: ['low', 'normal', 'high'] })
    expect(t('offertes').velden.get('status')?.soort).toBe('tekst')
    expect(t('facturen').velden.get('verzondenOp')?.soort).toBe('tijdstip-tekst')
    expect(t('offertes').velden.get('createdAt')?.soort).toBe('tijdstip')
    expect(t('facturen').velden.get('totaalInclBtw')?.soort).toBe('getal')
  })
})

describe('dagUit', () => {
  it('woorden en sommen naar jjjj-mm-dd', () => {
    expect(dagUit('vandaag', NU)).toBe('2026-10-28')
    expect(dagUit('gisteren', NU)).toBe('2026-10-27')
    expect(dagUit('morgen', NU)).toBe('2026-10-29')
    expect(dagUit('vandaag-7', NU)).toBe('2026-10-21')
    expect(dagUit('vandaag + 5', NU)).toBe('2026-11-02')
    expect(dagUit('begin_week', NU)).toBe('2026-10-26')
    expect(dagUit('begin_maand', NU)).toBe('2026-10-01')
    expect(dagUit('begin_jaar', NU)).toBe('2026-01-01')
    expect(dagUit('2026-03-29', NU)).toBe('2026-03-29')
  })
  it('onzin wordt een LeesFout met de mogelijkheden', () => {
    expect(() => dagUit('volgende week', NU)).toThrow(LeesFout)
    expect(() => dagUit('28-10-2026', NU)).toThrow(/jjjj-mm-dd/)
  })
})

describe('voorwaarde', () => {
  it('"aangemaakt vandaag" is van middernacht tot middernacht, in de eigen tijdzone', () => {
    expect(voorwaarde(t('offertes'), { veld: 'createdAt', is: '=', waarde: 'vandaag' }, NU)).toEqual({
      createdAt: { gte: new Date('2026-10-28T00:00:00'), lt: new Date('2026-10-29T00:00:00') },
    })
    expect(voorwaarde(t('offertes'), { veld: 'createdAt', is: '>', waarde: 'gisteren' }, NU)).toEqual({
      createdAt: { gte: new Date('2026-10-28T00:00:00') },
    })
  })

  it('keuze: alleen bestaande waarden; tekst zonder hoofdletters', () => {
    expect(voorwaarde(t('todos'), { veld: 'priority', is: '=', waarde: 'high' }, NU)).toEqual({ priority: 'high' })
    expect(() => voorwaarde(t('todos'), { veld: 'priority', is: '=', waarde: 'urgent' }, NU)).toThrow(/kan zijn: low, normal, high/)
    expect(voorwaarde(t('offertes'), { veld: 'status', is: '=', waarde: 'Concept' }, NU)).toEqual({ status: { equals: 'Concept', mode: 'insensitive' } })
    expect(voorwaarde(t('relaties'), { veld: 'naam', is: 'bevat', waarde: 'prins' }, NU)).toEqual({ naam: { contains: 'prins', mode: 'insensitive' } })
  })

  it('leeg en niet_leeg; een verplicht veld is nooit leeg', () => {
    // Een datum die als tekst bewaard is kan ook een lege tekst zijn.
    expect(voorwaarde(t('facturen'), { veld: 'verzondenOp', is: 'leeg' }, NU)).toEqual({ OR: [{ verzondenOp: null }, { verzondenOp: '' }] })
    expect(voorwaarde(t('facturen'), { veld: 'betaaldOp', is: 'niet_leeg' }, NU)).toEqual({ AND: [{ betaaldOp: { not: null } }, { betaaldOp: { not: '' } }] })
    expect(voorwaarde(t('relaties'), { veld: 'betalingstermijn', is: 'leeg' }, NU)).toEqual({ betalingstermijn: null })
    expect(voorwaarde(t('offertes'), { veld: 'createdAt', is: 'leeg' }, NU)).toEqual({ OR: [] })
  })

  it('getallen, ook met een komma; onzin wordt een LeesFout', () => {
    expect(voorwaarde(t('facturen'), { veld: 'totaalInclBtw', is: '>=', waarde: '1000,50' }, NU)).toEqual({ totaalInclBtw: { gte: 1000.5 } })
    expect(() => voorwaarde(t('facturen'), { veld: 'totaalInclBtw', is: '>', waarde: 'veel' }, NU)).toThrow(LeesFout)
  })

  it('een verborgen veld bestaat voor de assistent niet', () => {
    expect(() => voorwaarde(t('relaties'), { veld: 'iban', is: 'niet_leeg' }, NU)).toThrow(/geen veld "iban"/)
  })

  it('een verkeerde vergelijking zegt wat wel kan', () => {
    expect(() => voorwaarde(t('offertes'), { veld: 'createdAt', is: 'bevat', waarde: '10' }, NU)).toThrow(LeesFout)
    expect(() => voorwaarde(t('todos'), { veld: 'priority', is: '>', waarde: 'low' }, NU)).toThrow(LeesFout)
    expect(() => voorwaarde(t('offertes'), { veld: 'status', is: 'zoals' as never, waarde: 'x' }, NU)).toThrow(/Onbekende vergelijking/)
  })
})

describe('leesTabel en telTabel', () => {
  function nepDb(rijen: Record<string, unknown>[] = [], totaal = rijen.length) {
    const offerte = {
      findMany: vi.fn(async () => rijen), count: vi.fn(async () => totaal),
      aggregate: vi.fn(async () => ({ _sum: { totaalInclBtw: 1234.5 } })),
      groupBy: vi.fn(async () => [{ status: 'concept', _count: { _all: 3 } }, { status: 'verzonden', _count: { _all: 1 } }]),
    }
    return { db: { offerte, factuur: offerte } as never, offerte }
  }

  it('leest met filter, zet tijd leesbaar en een link erbij, en zegt waar hij keek', async () => {
    const { db, offerte } = nepDb([{ id: 'OFF-2026-014', projectId: 'PRJ-2026-009', status: 'concept', createdAt: new Date('2026-10-28T09:12:00') }])
    const r = await leesTabel(db, { tabel: 'offertes', waar: [{ veld: 'createdAt', is: '=', waarde: 'vandaag' }], velden: ['id', 'status', 'createdAt'] }, NU)
    expect(offerte.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, status: true, createdAt: true, projectId: true }, orderBy: { createdAt: 'desc' }, take: 25,
    }))
    expect(r.resultaat.rijen).toEqual([{ id: 'OFF-2026-014', status: 'concept', createdAt: '2026-10-28 09:12', link: '/projecten/PRJ-2026-009' }])
    expect(r.bron).toBe('offertes · createdAt = 28-10-2026 · 1 rij')
  })

  it('meer rijen dan getoond: zegt het erbij; nooit meer dan 50', async () => {
    const { db, offerte } = nepDb([{ id: 'a' }], 80)
    const r = await leesTabel(db, { tabel: 'offertes', max: 500 }, NU)
    expect((offerte.findMany.mock.calls[0] as unknown as [{ take: number }])[0].take).toBe(50)
    expect(r.resultaat.let_op).toMatch(/80 rijen/)
  })

  it('onbekende tabel of veld: een LeesFout die de keuzes noemt', async () => {
    const { db } = nepDb()
    await expect(leesTabel(db, { tabel: 'klanten' }, NU)).rejects.toThrow(/Kies uit: projecten, offertes/)
    await expect(leesTabel(db, { tabel: 'offertes', velden: ['bestaatNiet'] }, NU)).rejects.toThrow(LeesFout)
    await expect(leesTabel(db, { tabel: 'offertes', waar: ['status = concept'] }, NU)).rejects.toThrow(LeesFout)
  })

  it('telt per waarde en telt bedragen op', async () => {
    const { db } = nepDb()
    const g = await telTabel(db, { tabel: 'offertes', groepeer: 'status' }, NU)
    expect(g.resultaat).toMatchObject({ groepeerOp: 'status', groepen: [{ waarde: 'concept', aantal: 3 }, { waarde: 'verzonden', aantal: 1 }] })
    const s = await telTabel(db, { tabel: 'facturen', som: 'totaalInclBtw', waar: [{ veld: 'betaaldOp', is: 'leeg' }] }, NU)
    expect(s.resultaat).toMatchObject({ aantal: 0, som_totaalInclBtw: 1234.5 })
    expect(s.bron).toBe('facturen · betaaldOp leeg · telling: 0')
    await expect(telTabel(db, { tabel: 'offertes', som: 'status' }, NU)).rejects.toThrow(/alleen bij een getal/)
  })

  it('per dag bij een tijdstip', async () => {
    const { db } = nepDb([
      { createdAt: new Date('2026-10-28T09:00:00') }, { createdAt: new Date('2026-10-28T15:00:00') }, { createdAt: new Date('2026-10-27T11:00:00') },
    ])
    const g = await telTabel(db, { tabel: 'offertes', groepeer: 'createdAt' }, NU)
    expect(g.resultaat.groepen).toEqual([{ waarde: '2026-10-28', aantal: 2 }, { waarde: '2026-10-27', aantal: 1 }])
  })
})
