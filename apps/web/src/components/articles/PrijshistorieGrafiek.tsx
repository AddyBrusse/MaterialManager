import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { asLabel, euro, datumKort, yDomein, type LijnPunt } from './prijshistorie-lijn'

/**
 * Kostprijs en verkoopprijs per stuk over de tijd.
 *
 * Drie keuzes die hier het meeste uitmaken:
 *
 * - **Trapjeslijn, geen vloeiende curve.** Een prijs verandert niet geleidelijk
 *   tussen twee meetmomenten: hij staat stil en springt dan. Een vloeiende lijn
 *   zou over de tussenliggende maanden liegen.
 * - **Eén y-as, allebei per stuk bij 1.** Twee dingen mogen hier níét in de
 *   lijn: ordertotalen (€ 1.200 naast € 12 walst de lijn plat) en de kostprijs
 *   bij het aantal van de order. Dat laatste is de gemenere: insteltijd wordt
 *   over de batch verdeeld, dus een order van 10 stuks laat de kostprijs per
 *   stuk kelderen zonder dat er iets goedkoper geworden is. De lijn tekent
 *   daarom de herrekening bij 1 stuk; wat er bij dat aantal werkelijk gold
 *   staat in de tooltip en de tabel.
 * - **Alleen orders krijgen een bolletje.** Dat zijn de momenten waarop er echt
 *   iets verkocht is; de calculatiepunten dragen de lijn ertussen.
 */
export function PrijshistorieGrafiek({ punten }: { punten: LijnPunt[] }) {
  // Eén punt tekent geen lijn — recharts laat dan een lege plot zien.
  if (punten.length < 2) {
    return (
      <div className="ph-grafiek-leeg">
        Eén meetmoment tot nu toe — vanaf het tweede punt verschijnt hier de lijn.
      </div>
    )
  }

  return (
    <div className="ph-grafiek">
      <div className="ph-legenda">
        <span className="ph-legenda-item"><i data-lijn="verkoop" />Verkoopprijs</span>
        <span className="ph-legenda-item"><i data-lijn="kost" />Kostprijs</span>
        <span className="ph-legenda-item"><i data-lijn="order" />Order</span>
        <span className="ph-legenda-noot">per stuk, bij 1 — zodat de lijn over de tijd te vergelijken is</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={punten} margin={{ top: 8, right: 24, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={asLabel}
            tick={{ fontSize: 11, fill: 'var(--text-3)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            domain={yDomein(punten)}
            tickFormatter={(v: number) => euro(v, false)}
            tick={{ fontSize: 11, fill: 'var(--text-3)' }}
            axisLine={false}
            tickLine={false}
            width={54}
          />
          <Tooltip
            content={<PuntTooltip />}
            cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }}
          />
          <Line
            type="stepAfter" dataKey="verkoopprijs" name="Verkoopprijs"
            stroke="var(--chart-verkoop)" strokeWidth={2}
            dot={<OrderDot kleur="var(--chart-verkoop)" />} activeDot={{ r: 4 }}
          />
          <Line
            type="stepAfter" dataKey="kostprijs" name="Kostprijs"
            stroke="var(--chart-kost)" strokeWidth={2} strokeDasharray="5 3"
            dot={<OrderDot kleur="var(--chart-kost)" />} activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Een bolletje alleen op orderpunten — anders is de lijn één rij stippen en
 *  vallen de momenten die ertoe doen niet meer op. */
function OrderDot(props: { kleur: string; cx?: number; cy?: number; payload?: LijnPunt }) {
  const { cx, cy, payload, kleur } = props
  if (cx == null || cy == null || payload?.bron !== 'order') return null
  return (
    <circle
      cx={cx} cy={cy} r={4}
      fill={kleur} stroke="var(--bg-2)" strokeWidth={2}
    />
  )
}

interface TooltipProps {
  active?: boolean
  payload?: { payload: LijnPunt }[]
}

function PuntTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="ph-tip">
      <div className="ph-tip-kop">
        {datumKort(p.datum)}
        <span className="ph-bron" data-bron={p.bron}>
          {p.bron === 'order' ? 'Order' : 'Calculatie'}
        </span>
      </div>
      <div className="ph-tip-rij">
        <span><i data-lijn="verkoop" />Verkoopprijs</span><b>{euro(p.verkoopprijs)}</b>
      </div>
      <div className="ph-tip-rij">
        <span><i data-lijn="kost" />Kostprijs</span><b>{euro(p.kostprijs)}</b>
      </div>
      <div className="ph-tip-noot">per stuk, bij 1</div>

      {/* Bij een order hoort erbij wat er wérkelijk gebeurde: dat aantal maakt
          de prijs per stuk een heel ander getal dan de lijn laat zien. */}
      {p.bron === 'order' && (
        <div className="ph-tip-order">
          <div className="ph-tip-rij"><span>Verkocht</span><b>{p.qty} st</b></div>
          {p.klant && <div className="ph-tip-rij"><span>Klant</span><b>{p.klant}</b></div>}
          <div className="ph-tip-rij">
            <span>Betaald p/st</span><b>{euro(p.betaaldPerStuk)}</b>
          </div>
          <div className="ph-tip-rij">
            <span>Kostprijs bij {p.qty}</span><b>{euro(p.kostprijsBijAantal)}</b>
          </div>
        </div>
      )}
    </div>
  )
}
