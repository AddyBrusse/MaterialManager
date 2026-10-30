import { describe, it, expect, vi, beforeEach } from 'vitest'

// De gesprekslus zonder echte API: elke aanroep geeft het volgende antwoord uit de rij.
const antwoorden: unknown[] = []
const create = vi.fn(async () => {
  const a = antwoorden.shift()
  if (a instanceof Error) throw a
  return a
})
vi.mock('../ai-extract', () => ({ getClient: () => ({ beta: { messages: { create } } }) }))
const gebruikCreate = vi.fn(async () => ({}))
const offerte = {
  findMany: vi.fn(async () => [{ id: 'OFF-2026-014', projectId: 'PRJ-2026-009', status: 'concept', createdAt: new Date('2026-10-28T09:12:00') }]),
  count: vi.fn(async () => 1),
}
vi.mock('../../db/client', () => ({ prisma: { assistentGebruik: { create: gebruikCreate }, offerte } }))
vi.mock('../assistent-data', () => ({
  openActies: vi.fn(async () => ({ vandaag: '2026-10-12', meldingen: [], todos: [], inVoorbereiding: [], offertesNabellen: [] })),
  zoekProjecten: vi.fn(async () => []), projectDetail: vi.fn(async () => null), zoekVoorraad: vi.fn(async () => []),
}))

const { chat, AssistentWeigering, berichtZonderModel, inkorten } = await import('../assistent')

const toolUse = (id: string, name: string, input: object) => ({ type: 'tool_use', id, name, input })
const usage = (input: number, output: number, cacheRead = 0, cacheWrite = 0) =>
  ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite })
const klaar = (text: string) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: usage(100, 20) })
type Aanroep = { system: { text: string; cache_control?: object }[]; messages: { role: string; content: { tool_use_id: string; content: string; is_error?: boolean }[] }[] }
const aanroep = (i: number) => (create.mock.calls[i] as unknown as [Aanroep])[0]
const laatsteResultaten = (i: number) => { const m = aanroep(i).messages; return m[m.length - 1].content }

beforeEach(() => { antwoorden.length = 0; create.mockClear(); gebruikCreate.mockClear() })

describe('assistent chat', () => {
  it('voert tools uit, en neemt alleen knoppen naar een route in de app over', async () => {
    antwoorden.push(
      { model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [
        toolUse('t1', 'open_acties', {}),
        toolUse('t2', 'stel_actie_voor', { label: 'Bestellingen', link: '/bestellingen' }),
        toolUse('t3', 'stel_actie_voor', { label: 'Weg', link: 'https://example.com' }),
      ] },
      klaar('Er hoeft vandaag niets besteld te worden.'),
    )
    const a = await chat([{ rol: 'gebruiker', tekst: 'Wat moet er besteld worden?' }], 'Admin')
    expect(a.tekst).toBe('Er hoeft vandaag niets besteld te worden.')
    expect(a.acties).toEqual([{ label: 'Bestellingen', link: '/bestellingen' }])
    // Tweede aanroep krijgt de toolresultaten terug, met een fout voor de ongeldige knop.
    const tweede = (create.mock.calls[1] as unknown as [{ messages: { role: string; content: { tool_use_id: string; content: string }[] }[] }])[0]
    const res = tweede.messages[tweede.messages.length - 1].content
    expect(res.map((r) => r.tool_use_id)).toEqual(['t1', 't2', 't3'])
    expect(res[2].content).toContain('Ongeldige knop')
  })

  it('een weigering van het model wordt een eigen fout', async () => {
    antwoorden.push({ model: 'claude-opus-5-5', stop_reason: 'refusal', content: [] })
    await expect(chat([{ rol: 'gebruiker', tekst: 'x' }], 'Admin')).rejects.toBeInstanceOf(AssistentWeigering)
  })

  it('het gesprek begint altijd bij de gebruiker', async () => {
    antwoorden.push(klaar('ok'))
    await chat([{ rol: 'assistent', tekst: 'Hallo' }, { rol: 'gebruiker', tekst: 'Vraag' }], 'Admin')
    const eerste = (create.mock.calls[0] as unknown as [{ messages: { role: string }[] }])[0]
    expect(eerste.messages[0].role).toBe('user')
  })
})

describe('assistent: alle tabellen lezen (2026-10-28)', () => {
  it('lees_tabel geeft rijen terug, en de bron komt uit de echte aanroep', async () => {
    antwoorden.push(
      { model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: usage(5000, 80, 0, 9000), content: [
        toolUse('t1', 'lees_tabel', { tabel: 'offertes', waar: [{ veld: 'createdAt', is: '=', waarde: 'vandaag' }] }),
      ] },
      klaar('Vandaag is er één concept-offerte gemaakt: OFF-2026-014.'),
    )
    const a = await chat([{ rol: 'gebruiker', tekst: 'Zijn er vandaag concepten gemaakt?' }], 'Addy')
    expect(a.bronnen).toHaveLength(1)
    expect(a.bronnen[0]).toMatch(/^offertes · createdAt = \d{2}-\d{2}-\d{4} · 1 rij$/)
    const res = JSON.parse(laatsteResultaten(1)[0].content)
    expect(res.rijen[0]).toMatchObject({ id: 'OFF-2026-014', createdAt: '2026-10-28 09:12', link: '/projecten/PRJ-2026-009' })
  })

  it('een vraag die niet kan gaat als fout terug naar het model, dat het opnieuw kan proberen', async () => {
    antwoorden.push(
      { model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [toolUse('t1', 'lees_tabel', { tabel: 'klanten' })] },
      klaar('ok'),
    )
    const a = await chat([{ rol: 'gebruiker', tekst: 'x' }], 'Addy')
    const r = laatsteResultaten(1)[0]
    expect(r.is_error).toBe(true)
    expect(r.content).toMatch(/Onbekende tabel "klanten"/)
    expect(a.bronnen).toEqual([])
  })

  it('de instructies met de tabellen staan in de cache, zonder verborgen velden', async () => {
    antwoorden.push(klaar('ok'))
    await chat([{ rol: 'gebruiker', tekst: 'x' }], 'Addy')
    const sys = aanroep(0).system
    expect(sys[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(sys[0].text).toContain('## facturen')
    expect(sys[0].text).not.toMatch(/\biban\b/)
  })

  it('het verbruik van alle rondes wordt bewaard, ook als de laatste ronde mislukt', async () => {
    antwoorden.push(
      { model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: usage(5000, 80, 0, 9000), content: [toolUse('t1', 'open_acties', {})] },
      klaar('klaar'),
    )
    await chat([{ rol: 'gebruiker', tekst: 'x' }], 'Addy')
    expect(gebruikCreate).toHaveBeenCalledWith({ data: { soort: 'chat', model: 'claude-opus-5-5', rondes: 2, invoer: 5100, cacheLezen: 0, cacheSchrijven: 9000, uitvoer: 100 } })

    gebruikCreate.mockClear()
    antwoorden.push(
      { model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: usage(10, 1, 9000), content: [toolUse('t1', 'open_acties', {})] },
      new Error('overloaded'),
    )
    await expect(chat([{ rol: 'gebruiker', tekst: 'x' }], 'Addy')).rejects.toThrow('overloaded')
    expect(gebruikCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ rondes: 1, cacheLezen: 9000 }) })
  })
})

describe('inkorten', () => {
  it('hooguit acht met dezelfde titel naar het model, plus hoeveel er nog zijn', () => {
    const m = Array.from({ length: 11 }, (_, i) => ({ id: `f${i}`, groep: 'opvolging' as const, ernst: 'rood' as const, titel: 'Factuur over de vervaldatum', tekst: '', link: '/' }))
    const k = inkorten([...m, { ...m[0], id: 'x', titel: 'Over levertijd' }])
    expect(k.meldingen).toHaveLength(9)
    expect(k.weggelaten).toEqual({ 'Factuur over de vervaldatum': 3 })
  })
})

describe('berichtZonderModel', () => {
  it('niets open: één zin', () => {
    expect(berichtZonderModel({ vandaag: '2026-10-12', meldingen: [], todos: [], inVoorbereiding: [], offertesNabellen: [] }).tekst)
      .toBe('Niets dringends op dit moment.')
  })
})
