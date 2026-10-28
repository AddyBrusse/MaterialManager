import { useQuery } from '@tanstack/react-query'
import { assistentApi } from '../../api/assistent'
import { foutTekst } from '../../utils/fout-melding'

const getal = (n: number) => n.toLocaleString('nl-NL')
const miljoen = (n: number) => `${(n / 1_000_000).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} mln`

/**
 * Wat de assistent de laatste 30 dagen gebruikte (2026-10-28), gemeten per
 * antwoord op de server. Het bedrag is een schatting uit de prijslijst; wat er
 * echt afgeschreven wordt staat in de Anthropic Console.
 */
export function AssistentGebruik() {
  const { data, error, isLoading } = useQuery({ queryKey: ['assistent-gebruik'], queryFn: assistentApi.gebruik })
  if (isLoading) return <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Laden…</span>
  if (error) {
    const t = foutTekst({ actie: 'Gebruik van de assistent ophalen', fout: error, gevolg: 'Alleen deze telling ontbreekt; de assistent werkt gewoon.' })
    return (
      <div style={{ color: 'var(--danger)', fontSize: 12, textAlign: 'right' }}>
        {t.wat} {t.gevolg}
        <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{t.waar}</div>
      </div>
    )
  }
  if (!data) return null
  const tokens = data.invoer + data.cacheLezen + data.cacheSchrijven + data.uitvoer
  return (
    <div style={{ textAlign: 'right', fontSize: 12.5, lineHeight: 1.6 }} data-testid="assistent-gebruik">
      <div><b>{getal(data.chat)}</b> {data.chat === 1 ? 'antwoord' : 'antwoorden'} in de chat · <b>{getal(data.bericht)}</b> {data.bericht === 1 ? 'bericht' : 'berichten'}</div>
      <div style={{ color: 'var(--text-3)' }}>{miljoen(tokens)} tokens, waarvan {miljoen(data.cacheLezen)} uit de cache</div>
      <div>{data.kostenUsd === null ? 'Bedrag onbekend (ander model)' : <>ca. <b>$ {data.kostenUsd.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</b></>}</div>
    </div>
  )
}
