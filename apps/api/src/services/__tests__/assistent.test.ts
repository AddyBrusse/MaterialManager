import { describe, it, expect, vi, beforeEach } from 'vitest'

// De gesprekslus zonder echte API: elke aanroep geeft het volgende antwoord uit de rij.
const antwoorden: unknown[] = []
const create = vi.fn(async () => antwoorden.shift())
vi.mock('../ai-extract', () => ({ getClient: () => ({ beta: { messages: { create } } }) }))
vi.mock('../../db/client', () => ({ prisma: {} }))
vi.mock('../assistent-data', () => ({
  openActies: vi.fn(async () => ({ vandaag: '2026-10-12', meldingen: [], todos: [], inVoorbereiding: [], offertesNabellen: [] })),
  zoekProjecten: vi.fn(async () => []), projectDetail: vi.fn(async () => null), zoekVoorraad: vi.fn(async () => []),
}))

const { chat, AssistentWeigering, berichtZonderModel } = await import('../assistent')

const toolUse = (id: string, name: string, input: object) => ({ type: 'tool_use', id, name, input })
const klaar = (text: string) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text }] })

beforeEach(() => { antwoorden.length = 0; create.mockClear() })

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

describe('berichtZonderModel', () => {
  it('niets open: één zin', () => {
    expect(berichtZonderModel({ vandaag: '2026-10-12', meldingen: [], todos: [], inVoorbereiding: [], offertesNabellen: [] }).tekst)
      .toBe('Niets dringends op dit moment.')
  })
})
