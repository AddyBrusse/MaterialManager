import { dagKort, isTeLaat, type Preview } from './tabel-logica'
import type { SleepDoel } from './TabelRaster'

/** Het zwarte vak bij de muis tijdens het slepen: waar hij landt en wat er verschuift. */
export function SleepTip({ doel, reden, onbekend, gevolg, muis }: {
  doel: SleepDoel | null; reden: string | null; onbekend: string | null; gevolg: Preview | null; muis: { x: number; y: number }
}) {
  const stijl = { left: Math.min(muis.x + 18, window.innerWidth - 320), top: muis.y + 14 }
  if (reden) return <div className="pt-tip" style={stijl}><span className="r">Kan hier niet: {reden}</span></div>
  if (!doel) return null
  if (!gevolg) return <div className="pt-tip" style={stijl}><span className="m">Blijft waar hij staat.</span></div>

  const [eigen, ...rest] = gevolg.wijzigingen
  const laat = rest.filter((w) => isTeLaat(w.naar, w.uiterlijk))
  return (
    <div className="pt-tip" style={stijl}>
      <b>{doel.kolom ? `Loslaten: ${doel.kolom}` : 'Loslaten: niet ingepland'}</b>
      {eigen && doel.kolom && (
        <div className={isTeLaat(eigen.naar, eigen.uiterlijk) ? 'r' : undefined}>
          start {dagKort(eigen.naar)}{eigen.van && eigen.van !== eigen.naar ? ` (was ${dagKort(eigen.van)})` : ''}
          {isTeLaat(eigen.naar, eigen.uiterlijk) ? ` — te laat, uiterlijk ${dagKort(eigen.uiterlijk)}` : ''}
        </div>
      )}
      {rest.length > 0 && <div className="m">{rest.length} andere stap{rest.length === 1 ? '' : 'pen'} schuiven mee</div>}
      {rest.slice(0, 4).map((w) => (
        <div key={w.job.id} className={isTeLaat(w.naar, w.uiterlijk) ? 'r' : undefined}>
          {w.job.orderId} · {w.job.naam}: {dagKort(w.van)} → {dagKort(w.naar)}
        </div>
      ))}
      {laat.length > 0 && <div className="r">{laat.length} daarvan te laat</div>}
      {onbekend && <div className="m" style={{ marginTop: 4 }}>{onbekend}</div>}
    </div>
  )
}
