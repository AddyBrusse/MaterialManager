import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  aiSleutelMelding, sleutelWeergave, standUitAntwoord, vervangtStand, type AiSleutelStatus,
} from '@stockmanager/shared'
import { config } from '../../config'
import { controleer, meekijkFetch, sleutelStatus, verversAlsNodig } from '../ai-sleutel'

const status = (p: Partial<AiSleutelStatus> = {}): AiSleutelStatus => ({
  stand: 'werkt', op: '2026-10-28T10:00:00.000Z', bron: 'aanroep', reden: null,
  sleutel: 'sk-ant-api03-…AbCd', vormKlopt: true, modellen: ['claude-opus-5'], ...p,
})

describe('standUitAntwoord', () => {
  it('een verlopen of ingetrokken sleutel geeft 401: ongeldig', () => {
    expect(standUitAntwoord(401, 'invalid x-api-key')).toBe('ongeldig')
  })

  // 2026-09-28: een nieuwe sleutel zonder tegoed gaf 400 met deze reden.
  it('een leeg tegoed, als 400 met reden of als 402', () => {
    expect(standUitAntwoord(400, 'Your credit balance is too low to access the Anthropic API.')).toBe('geen_tegoed')
    expect(standUitAntwoord(402, 'billing_error')).toBe('geen_tegoed')
  })

  it('geen toegang, onbekend model, storing en gelukt', () => {
    expect(standUitAntwoord(403, 'x')).toBe('geen_toegang')
    expect(standUitAntwoord(404, 'model: claude-x')).toBe('model')
    expect(standUitAntwoord(429, 'x')).toBe('storing')
    expect(standUitAntwoord(529, 'Overloaded')).toBe('storing')
    expect(standUitAntwoord(null, 'socket hang up')).toBe('storing')
    expect(standUitAntwoord(200, '')).toBe('werkt')
  })

  it('een fout over het verzoek zegt niets over de sleutel', () => {
    expect(standUitAntwoord(400, 'prompt is too long')).toBeNull()
    expect(standUitAntwoord(413, 'request_too_large')).toBeNull()
  })
})

describe('vervangtStand', () => {
  it('de gratis controle wist een leeg tegoed niet', () => {
    expect(vervangtStand({ stand: 'geen_tegoed', bron: 'aanroep' }, { stand: 'werkt', bron: 'controle' })).toBe(false)
    expect(vervangtStand({ stand: 'geen_tegoed', bron: 'aanroep' }, { stand: 'werkt', bron: 'aanroep' })).toBe(true)
  })

  it('verder wint de nieuwste waarneming', () => {
    expect(vervangtStand(null, { stand: 'ongeldig', bron: 'controle' })).toBe(true)
    expect(vervangtStand({ stand: 'ongeldig', bron: 'controle' }, { stand: 'werkt', bron: 'controle' })).toBe(true)
    expect(vervangtStand({ stand: 'model', bron: 'aanroep' }, { stand: 'werkt', bron: 'controle' })).toBe(true)
    expect(vervangtStand({ stand: 'werkt', bron: 'controle' }, { stand: 'geen_tegoed', bron: 'aanroep' })).toBe(true)
  })
})

describe('sleutelWeergave', () => {
  it('toont alleen begin en eind, nooit de sleutel', () => {
    const geheim = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-wxyz'
    const w = sleutelWeergave(geheim)
    expect(w).toEqual({ sleutel: 'sk-ant-api03-…wxyz', vormKlopt: true })
    expect(w.sleutel).not.toContain('ABCDEF')
  })

  it('herkent een sleutel die geen gewone API-sleutel is', () => {
    expect(sleutelWeergave('sk-ant-admin01-abcdefgh1234')).toEqual({ sleutel: 'sk-ant-admin01-…1234', vormKlopt: false })
    expect(sleutelWeergave('iets-anders-9876')).toEqual({ sleutel: '…9876', vormKlopt: false })
    expect(sleutelWeergave(null)).toEqual({ sleutel: null, vormKlopt: false })
  })
})

describe('aiSleutelMelding', () => {
  it('rood bij een sleutel die niet werkt, met de weg naar Instellingen', () => {
    for (const stand of ['ongeldig', 'geen_tegoed', 'geen_toegang', 'model'] as const) {
      expect(aiSleutelMelding(status({ stand }), true)).toMatchObject({ ernst: 'rood', groep: 'systeem', link: '/instellingen#ai-sleutel' })
    }
    expect(aiSleutelMelding(status({ stand: 'ongeldig' }), true)!.tekst).toContain('Never')
  })

  it('geen melding als hij werkt, nog niet gecontroleerd is of even storing heeft', () => {
    for (const stand of ['werkt', 'onbekend', 'storing'] as const) expect(aiSleutelMelding(status({ stand }), true)).toBeNull()
  })

  it('geen sleutel: oranje, tenzij de AI bewust helemaal uit staat', () => {
    expect(aiSleutelMelding(status({ stand: 'ontbreekt', sleutel: null }), true)?.ernst).toBe('oranje')
    expect(aiSleutelMelding(status({ stand: 'ontbreekt', sleutel: null }), false)).toBeNull()
  })
})

describe('meekijkFetch', () => {
  const oud = config.ai.apiKey
  afterEach(() => { config.ai.apiKey = oud; vi.unstubAllGlobals() })

  const antwoord = (s: number, body: unknown) => new Response(JSON.stringify(body), { status: s, headers: { 'content-type': 'application/json' } })

  it('onthoudt wat de API bij een echte aanroep zei, en laat het antwoord heel', async () => {
    config.ai.apiKey = 'sk-ant-api03-test-AbCd'
    vi.stubGlobal('fetch', vi.fn(async () => antwoord(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })))
    const res = await meekijkFetch('https://api.anthropic.com/v1/messages', { method: 'POST' })
    expect(res.status).toBe(401)
    expect((await res.json()).error.message).toBe('invalid x-api-key')
    expect(sleutelStatus()).toMatchObject({ stand: 'ongeldig', bron: 'aanroep', reden: 'invalid x-api-key', sleutel: 'sk-ant-api03-…AbCd' })

    vi.stubGlobal('fetch', vi.fn(async () => antwoord(200, { ok: true })))
    await meekijkFetch('https://api.anthropic.com/v1/messages', { method: 'POST' })
    expect(sleutelStatus()).toMatchObject({ stand: 'werkt', reden: null })
  })

  it('een te grote mail laat de stand staan; geen verbinding is een storing', async () => {
    config.ai.apiKey = 'sk-ant-api03-test-AbCd'
    vi.stubGlobal('fetch', vi.fn(async () => antwoord(200, {})))
    await meekijkFetch('https://api.anthropic.com/v1/messages')
    vi.stubGlobal('fetch', vi.fn(async () => antwoord(413, { error: { message: 'request_too_large' } })))
    await meekijkFetch('https://api.anthropic.com/v1/messages')
    expect(sleutelStatus().stand).toBe('werkt')

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND api.anthropic.com') }))
    await expect(meekijkFetch('https://api.anthropic.com/v1/messages')).rejects.toThrow('ENOTFOUND')
    expect(sleutelStatus()).toMatchObject({ stand: 'storing', reden: 'getaddrinfo ENOTFOUND api.anthropic.com' })
  })

  it('zonder sleutel: ontbreekt, wat er ook eerder gezien is', () => {
    config.ai.apiKey = null
    expect(sleutelStatus()).toMatchObject({ stand: 'ontbreekt', sleutel: null })
  })
})

describe('controleer en verversAlsNodig', () => {
  const oud = config.ai.apiKey
  afterEach(() => { config.ai.apiKey = oud; vi.unstubAllGlobals() })

  /** Een nep-API: per stand wat de echte API zou antwoorden. Telt de verzoeken. */
  function nepApi(stand: { tegoed: boolean; ontbrekendModel?: string; raar?: boolean }) {
    const verzoeken: string[] = []
    const json = (s: number, body: unknown) => new Response(JSON.stringify(body), { status: s, headers: { 'content-type': 'application/json' } })
    const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      verzoeken.push(`${init?.method ?? 'GET'} ${url.pathname}`)
      if (url.pathname === '/v1/models') return json(200, { data: [], has_more: false, first_id: null, last_id: null })
      if (url.pathname.startsWith('/v1/models/')) {
        const id = url.pathname.slice('/v1/models/'.length)
        return id === stand.ontbrekendModel ? json(404, { error: { message: `model: ${id}` } }) : json(200, { type: 'model', id })
      }
      if (stand.raar) return json(400, { error: { message: 'max_tokens: iets onverwachts' } })
      if (!stand.tegoed) return json(400, { error: { message: 'Your credit balance is too low to access the Anthropic API.' } })
      return json(200, { id: 'msg', type: 'message', role: 'assistant', model: 'm', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })
    })
    vi.stubGlobal('fetch', f)
    return verzoeken
  }

  it('de gewone controle is gratis: geen verzoek aan het model', async () => {
    config.ai.apiKey = 'sk-ant-api03-test-AbCd'
    const verzoeken = nepApi({ tegoed: false })
    expect(await controleer()).toBeNull()
    expect(sleutelStatus()).toMatchObject({ stand: 'werkt', bron: 'controle' })
    expect(verzoeken[0]).toBe('GET /v1/models')
    expect(verzoeken.some((v) => v.includes('/v1/messages'))).toBe(false)
    expect(verzoeken.filter((v) => v.startsWith('GET /v1/models/'))).toHaveLength(config.ai.model === config.assistent.model ? 1 : 2)
  })

  it('de testknop ziet een leeg tegoed, en de gewone controle wist dat niet', async () => {
    config.ai.apiKey = 'sk-ant-api03-test-AbCd'
    nepApi({ tegoed: false })
    expect(await controleer(true)).toBeNull()
    expect(sleutelStatus()).toMatchObject({ stand: 'geen_tegoed', bron: 'aanroep' })
    await controleer()
    expect(sleutelStatus().stand).toBe('geen_tegoed')
  })

  it('na een kwartier kijkt hij zelf weer, bij een leeg tegoed volledig', async () => {
    config.ai.apiKey = 'sk-ant-api03-test-AbCd'
    const verzoeken = nepApi({ tegoed: true })
    verversAlsNodig(Date.now() + 5 * 60_000)
    expect(verzoeken).toHaveLength(0)
    verversAlsNodig(Date.now() + 16 * 60_000)
    await controleer(true)
    expect(verzoeken).toContain('POST /v1/messages')
    expect(sleutelStatus()).toMatchObject({ stand: 'werkt', bron: 'aanroep' })
  })

  it('een model dat het account niet mag: welk model, en geen betaald verzoek', async () => {
    config.ai.apiKey = 'sk-ant-api03-test-AbCd'
    const verzoeken = nepApi({ tegoed: true, ontbrekendModel: config.ai.model })
    await controleer(true)
    expect(sleutelStatus()).toMatchObject({ stand: 'model', reden: `${config.ai.model}: model: ${config.ai.model}` })
    expect(verzoeken.some((v) => v.includes('/v1/messages'))).toBe(false)
  })

  it('een onverwacht antwoord: de reden terug, de stand blijft staan', async () => {
    config.ai.apiKey = 'sk-ant-api03-test-AbCd'
    nepApi({ tegoed: true, raar: true })
    expect(await controleer(true)).toBe('max_tokens: iets onverwachts')
    expect(sleutelStatus().stand).toBe('model')
  })
})
