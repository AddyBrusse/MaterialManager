import { useState } from 'react'
import { Link } from 'react-router-dom'
import { secondenNaarUren } from '@stockmanager/shared'
import { useProjectNacalculatie, useStelNormBij } from '../../hooks/useNacalculatie'
import { PostenTabel, NacalculatieTegels, NietGemeten, Delta, euro } from './NacalculatiePaneel'
import type { OrderNacalculatie } from '../../api/nacalculatie'

/**
 * Nacalculatie van een project.
 *
 * Twee niveaus, want beide vragen worden gesteld: "hoe liep dit project" en
 * "welke orderregel trok het scheef". Het tweede zit in de tabel eronder, en per
 * regel is door te klikken naar de nacalculatie van dat artikel over alle orders
 * heen — één order is een anekdote, drie metingen zijn een norm.
 */
export function ProjectNacalculatieTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProjectNacalculatie(projectId)
  const normBij = useStelNormBij()
  const [open, setOpen] = useState<string | null>(null)

  if (isLoading) return <div className="st-empty">Nacalculatie laden…</div>
  if (!data || data.orders.length === 0) {
    return (
      <div className="st-empty">
        Dit project heeft nog geen productieorders met een calculatie.
      </div>
    )
  }

  // Het project als geheel heeft dezelfde vorm als een order, dus dezelfde
  // tegels — één component, geen tweede waarheid over wat "werkelijk" betekent.
  const projectAlsGeheel = {
    qty: 0,
    regels: [],
    gecalculeerdTotaal: data.gecalculeerdTotaal,
    werkelijkTotaal: data.werkelijkTotaal,
    verschilTotaal: data.verschilTotaal,
    verschilPct: data.verschilPct,
    verkoopTotaal: data.verkoopTotaal,
    margeGecalculeerdPct: data.margeGecalculeerdPct,
    margeWerkelijkPct: data.margeWerkelijkPct,
    margeWerkelijkEuro: data.verkoopTotaal == null ? null : data.verkoopTotaal - data.werkelijkTotaal,
    gemeten: data.gemeten,
    onbemandSeconden: 0,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <NacalculatieTegels n={projectAlsGeheel} />
      {!data.gemeten && <NietGemeten />}

      <div className="st-card">
        <div className="st-card-hd">Per orderregel</div>
        <div className="st-table-wrap">
          <table className="st-tbl">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Order</th>
                <th>Artikel</th>
                <th style={{ width: 60, textAlign: 'right' }}>Aantal</th>
                <th style={{ width: 110, textAlign: 'right' }}>Gecalculeerd</th>
                <th style={{ width: 110, textAlign: 'right' }}>Werkelijk</th>
                <th style={{ width: 70, textAlign: 'right' }}>Verschil</th>
                <th style={{ width: 100, textAlign: 'right' }}>Omzet</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <OrderRij
                  key={o.orderId} o={o}
                  open={open === o.orderId}
                  onToggle={() => setOpen(open === o.orderId ? null : o.orderId)}
                  onNorm={(v) => o.artikelId && normBij.mutate({ artikelId: o.artikelId, ...v })}
                  bezig={normBij.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function OrderRij({ o, open, onToggle, onNorm, bezig }: {
  o: OrderNacalculatie
  open: boolean
  onToggle: () => void
  onNorm: (v: { instelMin?: number; cycleMinPerStuk?: number }) => void
  bezig: boolean
}) {
  const instellen = o.regels.find((r) => r.post === 'instellen')
  const draaien = o.regels.find((r) => r.post === 'draaien')

  return (
    <>
      <tr>
        <td className="cell-mono cell-muted">{o.orderId}</td>
        <td>
          <div className="cell-strong">{o.artikelNaam}</div>
          {o.artikelId && (
            <div className="cell-muted" style={{ fontSize: 11.5 }}>
              <Link to={`/artikelen/${o.artikelId}`}>{o.artikelId}</Link>
              {!o.gemeten && ' · nog niet gemeten'}
            </div>
          )}
        </td>
        <td className="cell-mono cell-num">{o.qty}</td>
        <td className="cell-mono cell-muted cell-num">{euro(o.gecalculeerdTotaal)}</td>
        <td className="cell-mono cell-strong cell-num">{euro(o.werkelijkTotaal)}</td>
        <td style={{ textAlign: 'right' }}><Delta pct={o.verschilPct} /></td>
        <td className="cell-mono cell-muted cell-num">
          {o.verkoopTotaal == null ? '—' : euro(o.verkoopTotaal)}
        </td>
        <td className="row-actions">
          <button className="st-btn xs" onClick={onToggle}>{open ? 'sluit' : 'opbouw'}</button>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={8} style={{ padding: 12, background: 'var(--bg-sidebar)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <PostenTabel n={o} titel={`Opbouw ${o.orderId}`} />

              {/* De conclusie in gewone taal. Zonder dit blijft het een tabel
                  waar iedereen zelf een verhaal bij moet verzinnen. */}
              {o.gemeten && (
                <div className="tr-conclusie">
                  <div className="tr-conclusie-kop">
                    <div className="tr-conclusie-titel">Wat dit zegt</div>
                    <div className="tr-conclusie-sub">afgeleid uit de metingen</div>
                  </div>
                  <div className="tr-conclusie-tekst">
                    {instellen && draaien ? (
                      <Zin instellenPct={instellen.verschilPct} draaienPct={draaien.verschilPct} qty={o.qty} />
                    ) : 'Nog te weinig gemeten om er iets over te zeggen.'}
                    {o.onbemandSeconden > 0 && (
                      <> Daarvan liep {secondenNaarUren(o.onbemandSeconden)} onbemand — die uren kosten geen operator.</>
                    )}
                  </div>
                  <div className="tr-conclusie-sep" />
                  <div className="tr-conclusie-actie">
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                      {o.advies?.instelMin != null
                        ? <>Advies instelnorm: <span className="cell-strong">{o.advies.instelMin} min</span></>
                        : 'Instelnorm: minstens drie metingen nodig voor een advies.'}
                      {o.advies?.cycleMin != null && (
                        <><br />Advies cyclus: <span className="cell-strong">{o.advies.cycleMin} min/stuk</span></>
                      )}
                    </div>
                    {(o.advies?.instelMin != null || o.advies?.cycleMin != null) && (
                      <button
                        className="st-btn" disabled={bezig}
                        onClick={() => onNorm({
                          instelMin: o.advies?.instelMin ?? undefined,
                          cycleMinPerStuk: o.advies?.cycleMin ?? undefined,
                        })}
                      >
                        Norm bijstellen
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * De zin die het verschil uitlegt.
 *
 * Instellen en draaien apart benoemen is het hele punt: instellen telt één keer
 * per batch, dus bij een kleine serie weegt het zwaar en bij een herhaalorder
 * bijna niet. Zonder die nuance leest een tekort als "te traag gewerkt".
 */
function Zin({ instellenPct, draaienPct, qty }: {
  instellenPct: number | null; draaienPct: number | null; qty: number
}) {
  const i = instellenPct ?? 0
  const d = draaienPct ?? 0
  const instelUit = Math.abs(i) >= 5
  const draaiUit = Math.abs(d) >= 5

  if (!instelUit && !draaiUit) {
    return <>De calculatie klopte: instellen en draaien liepen allebei binnen 5% van wat begroot was.</>
  }
  return (
    <>
      {draaiUit && (
        <>Het draaien ging <span className="cell-strong">{d < 0 ? 'sneller' : 'langzamer'}</span> dan
          gecalculeerd ({Math.abs(d).toFixed(0)}%). </>
      )}
      {instelUit && (
        <>Het instellen kostte <span className="cell-strong">{i > 0 ? `${i.toFixed(0)}% meer` : `${Math.abs(i).toFixed(0)}% minder`}</span>,
          en dat telt maar één keer per batch. </>
      )}
      {instelUit && i > 0 && qty > 0 && (
        <>Bij {qty} stuks weegt dat instellen zwaar; bij een grotere serie zou dit werk
          dichter bij de calculatie uitkomen.</>
      )}
    </>
  )
}
