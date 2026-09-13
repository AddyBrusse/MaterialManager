import { Link } from 'react-router-dom'
import { minToHm } from '@stockmanager/shared'
import { useArtikelNacalculatie, useStelNormBij } from '../../hooks/useNacalculatie'
import { PostenTabel, Delta, euro } from './NacalculatiePaneel'

/**
 * Nacalculatie bij het artikel zelf, over alle orders heen.
 *
 * Dit is de vorm waar de calculatie iets aan heeft. Eén order zegt weinig — de
 * dag kan tegen hebben gezeten, het materiaal kan taai zijn geweest. Pas over
 * meerdere orders wordt zichtbaar of de norm structureel te laag staat, en pas
 * dan is bijstellen verdedigbaar.
 */
export function ArtikelNacalculatieTab({ artikelId }: { artikelId: string }) {
  const { data, isLoading } = useArtikelNacalculatie(artikelId)
  const normBij = useStelNormBij()

  if (isLoading) return <div className="st-empty">Nacalculatie laden…</div>
  if (!data || data.orders.length === 0) {
    return (
      <div className="st-empty">
        Dit artikel is nog niet geproduceerd, of de orders hebben geen calculatie.
        Zodra er tijd op geregistreerd is verschijnt hier het verschil tussen
        geschat en werkelijk.
      </div>
    )
  }

  const kanBijstellen = data.advies.instelMin != null || data.advies.cycleMin != null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      <div className="st-stats">
        <div className="st-stat">
          <span className="st-stat-lbl">Gemeten orders</span>
          <span className="st-stat-val">{data.gemetenOrders}<span className="cell-muted" style={{ fontSize: 13 }}> / {data.aantalOrders}</span></span>
          <span className="st-stat-foot">
            {data.gemetenOrders < 3 ? 'drie metingen nodig voor een norm' : 'genoeg voor een norm'}
          </span>
        </div>
        <div className="st-stat">
          <span className="st-stat-lbl">Gemiddeld verschil</span>
          <span className="st-stat-val"><Delta pct={data.verschilPct} /></span>
          <span className="st-stat-foot">werkelijk tegenover gecalculeerd</span>
        </div>
        <div className="st-stat">
          <span className="st-stat-lbl">Instelnorm nu</span>
          <span className="st-stat-val">{data.huidig ? minToHm(data.huidig.instelMin) : '—'}</span>
          <span className="st-stat-foot">
            {data.advies.instelMin != null
              ? `gemeten gemiddelde: ${minToHm(data.advies.instelMin)}`
              : 'te weinig metingen voor een advies'}
          </span>
        </div>
        <div className="st-stat">
          <span className="st-stat-lbl">Cyclusnorm nu</span>
          <span className="st-stat-val">
            {data.huidig ? `${data.huidig.cycleMinPerStuk} min` : '—'}
          </span>
          <span className="st-stat-foot">
            {data.advies.cycleMin != null
              ? `gemeten: ${data.advies.cycleMin} min/stuk`
              : 'nog niets gedraaid geregistreerd'}
          </span>
        </div>
      </div>

      {/* De terugkoppeling naar de calculatie. Zonder deze knop is de hele
          nacalculatie een rapport dat niemand leest. */}
      {kanBijstellen && (
        <div className="tr-conclusie">
          <div className="tr-conclusie-kop">
            <div className="tr-conclusie-titel">Norm bijstellen</div>
            <div className="tr-conclusie-sub">
              {data.gemetenOrders} {data.gemetenOrders === 1 ? 'meting' : 'metingen'}
            </div>
          </div>
          <div className="tr-conclusie-tekst">
            Dit past de calculatie van dit artikel aan, dus werkt het door in elke
            volgende offerte. De wijziging verschijnt ook als punt in het prijsverloop
            hiernaast, zodat later terug te zien is wanneer en waarom de kostprijs
            veranderde.
            {data.gemetenOrders < 3 && (
              <> Let op: met {data.gemetenOrders} {data.gemetenOrders === 1 ? 'meting' : 'metingen'} is
                dit nog een momentopname, geen norm.</>
            )}
          </div>
          <div className="tr-conclusie-sep" />
          <div className="tr-conclusie-actie">
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
              {data.advies.instelMin != null && (
                <>Instellen {data.huidig ? minToHm(data.huidig.instelMin) : '—'} → <span className="cell-strong">{minToHm(data.advies.instelMin)}</span><br /></>
              )}
              {data.advies.cycleMin != null && (
                <>Cyclus {data.huidig?.cycleMinPerStuk ?? 0} → <span className="cell-strong">{data.advies.cycleMin} min/stuk</span></>
              )}
            </div>
            <button
              className="st-btn primary" disabled={normBij.isPending}
              onClick={() => normBij.mutate({
                artikelId,
                instelMin: data.advies.instelMin ?? undefined,
                cycleMinPerStuk: data.advies.cycleMin ?? undefined,
              })}
            >
              Norm bijstellen
            </button>
          </div>
        </div>
      )}

      <div className="st-card">
        <div className="st-card-hd">Per order</div>
        <div className="st-table-wrap">
          <table className="st-tbl">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Order</th>
                <th style={{ width: 130 }}>Project</th>
                <th style={{ width: 60, textAlign: 'right' }}>Aantal</th>
                <th style={{ width: 110, textAlign: 'right' }}>Gecalculeerd</th>
                <th style={{ width: 110, textAlign: 'right' }}>Werkelijk</th>
                <th style={{ width: 70, textAlign: 'right' }}>Verschil</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.orderId}>
                  <td className="cell-mono cell-muted">{o.orderId}</td>
                  <td className="cell-mono">
                    <Link to={`/projecten/${o.projectId}`}>{o.projectId}</Link>
                  </td>
                  <td className="cell-mono cell-num">{o.qty}</td>
                  <td className="cell-mono cell-muted cell-num">{euro(o.gecalculeerdTotaal)}</td>
                  <td className="cell-mono cell-strong cell-num">{euro(o.werkelijkTotaal)}</td>
                  <td style={{ textAlign: 'right' }}><Delta pct={o.verschilPct} /></td>
                  <td>
                    {o.gemeten
                      ? <span className="st-badge ok">gemeten</span>
                      : <span className="st-badge">nog niet gemeten</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* De opbouw van de meest recente gemeten order, zodat je niet hoeft door
          te klikken om te zien wáár het verschil zit. */}
      {(() => {
        const laatste = [...data.orders].reverse().find((o) => o.gemeten)
        return laatste ? <PostenTabel n={laatste} titel={`Opbouw laatste gemeten order (${laatste.orderId})`} /> : null
      })()}
    </div>
  )
}
