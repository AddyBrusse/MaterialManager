import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { AI_SLEUTEL_UITLEG, type AiSleutelStand, type AiSleutelStatus } from '@stockmanager/shared'
import { aiSleutelApi } from '../../api/ai-sleutel'
import { meldFout } from '../../utils/fout-melding-toon'
import { SectionHeader, SettingRow } from './InstellingRij'

const BADGE: Record<AiSleutelStand, string> = {
  werkt: 'ok', ontbreekt: 'warn', ongeldig: 'danger', geen_tegoed: 'danger', geen_toegang: 'danger', model: 'danger', storing: 'warn', onbekend: '',
}

const code = { fontFamily: 'var(--font-mono)', fontSize: 11 } as const

function wanneer(s: AiSleutelStatus): string {
  if (!s.op) return 'nog niet gecontroleerd'
  const t = new Date(s.op).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return `${t} · ${s.bron === 'controle' ? 'eigen controle' : 'bij gebruik of test'}`
}

function Uitleg({ s }: { s: AiSleutelStatus }) {
  return (
    <>
      {AI_SLEUTEL_UITLEG[s.stand].wat}
      {s.stand === 'werkt' && s.bron === 'controle' && ' Het tegoed is daarmee nog niet gecontroleerd; dat doet "Nu testen".'}
      {s.reden && <div style={{ ...code, marginTop: 4 }}>De API zei: {s.reden}</div>}
    </>
  )
}

/**
 * De AI-sleutel (2026-10-28): werkt hij, en zo niet, wat moet er gebeuren. De
 * sleutel staat in de omgeving van de server; hier staan alleen begin en eind,
 * zodat je na een herstart ziet of de server de nieuwe gebruikt.
 */
export function AiSleutelSectie() {
  const qc = useQueryClient()
  const { hash } = useLocation()
  const { data: s, error } = useQuery({ queryKey: ['ai-sleutel'], queryFn: aiSleutelApi.status, refetchInterval: 30000 })
  const geladen = !!s
  useEffect(() => {
    if (hash === '#ai-sleutel' && geladen) document.getElementById('ai-sleutel')?.scrollIntoView({ block: 'start' })
  }, [hash, geladen])

  const test = useMutation({
    mutationFn: aiSleutelApi.test,
    onSuccess: (n) => {
      qc.setQueryData(['ai-sleutel'], n)
      qc.invalidateQueries({ queryKey: ['meldingen'] })
      const u = AI_SLEUTEL_UITLEG[n.stand]
      notifications.show({
        color: n.stand === 'werkt' ? 'green' : 'orange', title: u.titel,
        message: n.stand === 'werkt' ? 'De sleutel werkt en er is tegoed.' : u.wat,
      })
    },
    onError: (fout) => meldFout({
      actie: 'AI-sleutel testen', fout,
      gevolg: 'Er is niets veranderd; de stand hieronder is die van de vorige controle.',
    }),
  })

  return (
    <>
      <SectionHeader id="ai-sleutel" title="AI-sleutel"
        desc="Eén sleutel (ANTHROPIC_API_KEY) voor de mail-import en de assistent. Hij staat in de omgeving van de server, niet in de database." />
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {!s && (
          <div style={{ padding: '16px 0', fontSize: 12.5, color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
            {error ? `De stand van de sleutel kon niet geladen worden: ${(error as Error).message}` : 'Laden…'}
          </div>
        )}
        {s && (
          <>
            <SettingRow title="Stand" desc={<Uitleg s={s} />}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className={`st-badge ${BADGE[s.stand]}`} data-stand={s.stand}><span className="dot" />{AI_SLEUTEL_UITLEG[s.stand].titel}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{wanneer(s)}</span>
                <button type="button" className="st-btn" disabled={test.isPending} onClick={() => test.mutate()}>
                  {test.isPending ? 'Testen…' : 'Nu testen'}
                </button>
              </div>
            </SettingRow>
            <SettingRow title="Sleutel van de server"
              desc={s.sleutel && !s.vormKlopt
                ? 'Dit lijkt geen gewone API-sleutel: die beginnen met sk-ant-api. Een Admin-sleutel (sk-ant-admin…) werkt niet voor de mail-import en de assistent.'
                : 'Begin en eind van de sleutel die de server nu gebruikt. Na het vervangen hoort hier de nieuwe te staan; zo niet, dan is de server niet herstart of gaat een Windows-omgevingsvariabele ANTHROPIC_API_KEY voor op het bestand.'}>
              <span className="cell-mono" style={{ fontSize: 12.5 }}>{s.sleutel ?? 'geen'}</span>
            </SettingRow>
            <SettingRow title="Modellen" desc="Uit MAIL_AI_MODEL en ASSISTENT_MODEL. De controle kijkt ook of dit account ze mag gebruiken.">
              <span className="cell-mono" style={{ fontSize: 12, textAlign: 'right' }}>{s.modellen.join(', ')}</span>
            </SettingRow>
          </>
        )}
        <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '10px 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--text-2)' }}>Sleutel vervangen:</strong> maak op{' '}
            <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">platform.claude.com/settings/keys</a>{' '}
            een nieuwe sleutel en kies bij de verloopdatum <strong>Never</strong>; een verlopen sleutel is niet opnieuw te activeren.
            Zet hem achter <code style={code}>ANTHROPIC_API_KEY=</code> in <code style={code}>.env.development</code> in de hoofdmap (pc)
            of in <code style={code}>docker/.env</code> (NAS) en herstart de server. In het venster van de server staat daarna{' '}
            <code style={code}>[ai] Sleutel …: Sleutel werkt</code>. Plak een sleutel nooit in een chat, een mail of de repo.
          </div>
        </div>
      </div>
    </>
  )
}
