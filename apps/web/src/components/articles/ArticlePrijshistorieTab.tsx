import { useQuery } from '@tanstack/react-query'
import { prijshistorieApi } from '../../api/prijshistorie'
import { naarLijn, samenvatten, euro, datumKort, type LijnPunt } from './prijshistorie-lijn'
import { PrijshistorieGrafiek } from './PrijshistorieGrafiek'

/**
 * Prijsverloop van één artikel: grafiek boven, de losse meetmomenten eronder.
 *
 * De tabel is niet dubbelop met de grafiek — daar lees je de vorm, hier de
 * bedragen, het aantal en de klant. Bij een prijs per stuk hoort altijd het
 * aantal: instelkosten worden over de batch verdeeld.
 */
export function ArticlePrijshistorieTab({ articleId }: { articleId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['prijshistorie', articleId],
    queryFn: () => prijshistorieApi.list(articleId).then((r) => r.data),
  })

  if (isLoading) return <div className="st-empty">Prijshistorie laden…</div>
  if (error) return <div className="st-empty">Prijshistorie kon niet geladen worden.</div>

  const punten = naarLijn(data ?? [])
  if (punten.length === 0) {
    return (
      <div className="st-empty">
        Nog geen prijshistorie.<br />
        Er komt een punt bij zodra de calculatie een andere prijs oplevert, en bij
        elke offerte die je accepteert.
      </div>
    )
  }

  const s = samenvatten(punten)
  return (
    <div className="ph-wrap">
      <div className="ph-stats">
        <Stat label="Kostprijs nu" waarde={euro(s.laatsteKostprijs)} noot="per stuk, bij 1" />
        <Stat label="Verkoopprijs nu" waarde={euro(s.laatsteVerkoopprijs)} noot="per stuk, bij 1" />
        <Stat
          label="Sinds het eerste punt"
          waarde={s.verschilPct == null ? '—' : `${s.verschilPct > 0 ? '+' : ''}${s.verschilPct.toLocaleString('nl-NL')}%`}
          toon={s.verschilPct == null ? undefined : s.verschilPct > 0 ? 'op' : s.verschilPct < 0 ? 'af' : undefined}
        />
        <Stat label="Orders" waarde={String(s.aantalOrders)} />
      </div>

      <PrijshistorieGrafiek punten={punten} />

      <PuntenTabel punten={punten} />
    </div>
  )
}

function Stat({ label, waarde, toon, noot }: {
  label: string; waarde: string; toon?: 'op' | 'af'; noot?: string
}) {
  return (
    <div className="ph-stat">
      <div className="ph-stat-label">{label}</div>
      <div className="ph-stat-waarde" data-toon={toon}>{waarde}</div>
      {noot && <div className="ph-stat-noot">{noot}</div>}
    </div>
  )
}

/**
 * Nieuwste bovenaan: wat er het laatst gebeurde is waar je naar zoekt.
 *
 * Anders dan de grafiek staan hier de bedragen zoals ze op dat moment golden —
 * bij het aantal van die order, niet herrekend naar 1 stuk. Daarom staat de
 * kolom Aantal er direct naast: zonder aantal is een prijs per stuk niet te
 * lezen.
 */
function PuntenTabel({ punten }: { punten: LijnPunt[] }) {
  const rijen = [...punten].reverse()
  return (
    <div className="ph-tabel-wrap">
      <table className="st-tbl ph-tabel">
        <thead>
          <tr>
            <th style={{ width: '13%' }}>Datum</th>
            <th style={{ width: '17%' }}>Wat</th>
            <th style={{ width: '22%' }}>Klant</th>
            <th style={{ width: '10%', textAlign: 'right' }}>Aantal</th>
            <th style={{ width: '13%', textAlign: 'right' }}>Kostprijs</th>
            <th style={{ width: '13%', textAlign: 'right' }}>Verkoop</th>
            <th style={{ width: '12%', textAlign: 'right' }}>Marge</th>
          </tr>
        </thead>
        <tbody>
          {rijen.map((p, i) => {
            const marge = p.betaaldPerStuk != null && p.kostprijsBijAantal > 0
              ? Math.round(((p.betaaldPerStuk / p.kostprijsBijAantal) - 1) * 1000) / 10
              : null
            return (
              <tr key={`${p.t}-${i}`}>
                <td className="cell-mono">{datumKort(p.datum)}</td>
                <td>
                  <span className="ph-bron" data-bron={p.bron}>
                    {p.bron === 'order' ? 'Order' : 'Calculatie'}
                  </span>
                  {p.bron === 'order' && p.offerteId && (
                    <span className="ph-ref">{p.offerteId}</span>
                  )}
                </td>
                <td>{p.klant ?? '—'}</td>
                <td className="cell-mono" style={{ textAlign: 'right' }}>{p.qty}</td>
                <td className="cell-mono" style={{ textAlign: 'right' }}>{euro(p.kostprijsBijAantal)}</td>
                <td className="cell-mono" style={{ textAlign: 'right' }}>{euro(p.betaaldPerStuk)}</td>
                <td className="cell-mono" style={{ textAlign: 'right' }}>
                  {marge == null ? '—' : `${marge.toLocaleString('nl-NL')}%`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
