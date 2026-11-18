import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@mantine/core'
import { IconClipboardCheck } from '@tabler/icons-react'
import type { ArtikelMutatie } from '@stockmanager/shared'
import { articlesApi } from '../../../api/articles'
import { TelVenster } from './TelVenster'

const getal = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
const tijd = (iso: string) => new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const SOORT: Record<ArtikelMutatie['soort'], string> = { factuur: 'Losse factuur', credit: 'Retour (credit)', hand: 'Geteld' }

/**
 * De voorraad van een artikel (2026-11-18), in twee getallen: vrij (wat er
 * ligt en aan niemand vastzit) en klaar voor orders (gereedgemeld, nog niet
 * op een verstuurde pakbon). Alleen vrij is te tellen; de rest volgt uit de
 * productie en de pakbonnen.
 */
export function ArtikelVoorraadKaart({ artikelId, alleenLezen }: { artikelId: string; alleenLezen: boolean }) {
  const [tellen, setTellen] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: ['artikel-voorraad', artikelId],
    queryFn: () => articlesApi.voorraad(artikelId),
  })

  return (
    <section className="av-sectie">
      <div className="av-kop">
        <h3>Voorraad</h3>
        <span className="av-uitleg">
          Een losse factuur haalt hem van de vrije voorraad, een credit met retour zet hem terug. Klopt het niet, tel dan.
        </span>
        <Button size="xs" variant="light" leftSection={<IconClipboardCheck size={12} />} disabled={alleenLezen || !data}
          onClick={() => setTellen(true)}>Tellen</Button>
      </div>
      {isLoading ? <div className="st-empty">Voorraad laden…</div>
        : error || !data ? <div className="st-empty">De voorraad kon niet geladen worden.</div>
        : (
          <>
            <div className="ph-stats">
              <div className="ph-stat">
                <div className="ph-stat-label">Vrij</div>
                <div className="ph-stat-waarde" data-testid="voorraad-vrij">{getal(data.vrij)}</div>
                <div className="ph-stat-noot">te verkopen, per losse factuur</div>
              </div>
              <div className="ph-stat">
                <div className="ph-stat-label">Klaar voor orders</div>
                <div className="ph-stat-waarde" data-testid="voorraad-klaar">{getal(data.klaarVoorOrders)}</div>
                <div className="ph-stat-noot">gereedgemeld, nog niet geleverd</div>
              </div>
            </div>
            {data.mutaties.length === 0 ? (
              <div className="st-empty" style={{ padding: 18 }}>
                Nog niets geboekt. Tel de voorraad één keer, dan klopt het getal vanaf dan.
              </div>
            ) : (
              <div className="ph-tabel-wrap">
                <table className="st-tbl av-tabel">
                  <thead>
                    <tr>
                      <th style={{ width: '18%' }}>Wanneer</th>
                      <th style={{ width: '16%' }}>Wat</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Aantal</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Stand</th>
                      <th>Reden</th>
                      <th style={{ width: '12%' }}>Door</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mutaties.map((m) => (
                      <tr key={m.id}>
                        <td className="cell-mono">{tijd(m.createdAt)}</td>
                        <td>{SOORT[m.soort]}</td>
                        <td className={`cell-mono ${m.aantal > 0 ? 'av-plus' : m.aantal < 0 ? 'av-min' : ''}`} style={{ textAlign: 'right' }}>
                          {m.aantal > 0 ? '+' : ''}{getal(m.aantal)}
                        </td>
                        <td className="cell-mono" style={{ textAlign: 'right' }}>{getal(m.stand)}</td>
                        <td>{m.reden ?? '—'}</td>
                        <td>{m.door}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      {tellen && data && <TelVenster artikelId={artikelId} huidig={data.vrij} onSluit={() => setTellen(false)} />}
    </section>
  )
}
