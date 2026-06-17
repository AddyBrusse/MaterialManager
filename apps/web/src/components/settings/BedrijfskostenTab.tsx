import { useState } from 'react'
import { overheadApi, shopAnnualHours, type ShopConfig } from '../../api/overhead'

const eur  = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtN = (n: number, dec = 0) => n.toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec })

function SH({ label }: { label: string }) {
  return (
    <tr style={{ cursor: 'default' }}>
      <td colSpan={3} style={{ paddingTop: 12, paddingBottom: 2 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)' }}>
          {label}
        </div>
      </td>
    </tr>
  )
}

function SR({ label, unit, value, onChange, step = 1, placeholder }: {
  label: string; unit: string; value: number
  onChange: (v: number) => void; step?: number; placeholder?: string
}) {
  return (
    <tr style={{ cursor: 'default' }}>
      <td style={{ fontWeight: 500, fontSize: 12.5, whiteSpace: 'nowrap', paddingRight: 16 }}>{label}</td>
      <td style={{ color: 'var(--text-3)', fontSize: 11.5, whiteSpace: 'nowrap', paddingRight: 12 }}>{unit}</td>
      <td style={{ padding: '3px 8px', width: 148 }}>
        <input
          className="st-input cell-mono"
          style={{ width: '100%', textAlign: 'right' }}
          type="number" min={0} step={step} placeholder={placeholder}
          value={value || ''}
          onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
      </td>
    </tr>
  )
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', minWidth: 180 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)', marginBottom: 4 }}>
        {label}
      </div>
      <div className="cell-mono" style={{ fontSize: 13.5, fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function BedrijfskostenTab() {
  const [cfg, setCfg] = useState(() => overheadApi.load())

  function patchShop(patch: Partial<ShopConfig>) {
    const next = { ...cfg, shop: { ...cfg.shop, ...patch } }
    setCfg(next)
    overheadApi.save(next)
  }

  const annualHrs  = shopAnnualHours(cfg.shop)
  const totalBldg  = cfg.shop.annualRentEur + cfg.shop.annualInsuranceEur + cfg.shop.annualBuildingMaintenanceEur
  const shopRateM2 = cfg.shop.totalFloorM2 > 0 ? totalBldg / cfg.shop.totalFloorM2 : 0
  const totalAnnual = totalBldg + cfg.shop.annualStaffOverheadEur

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 40, maxWidth: 900 }}>
      {/* Config table */}
      <div style={{ flex: '0 0 auto' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 3px' }}>Bedrijfskosten</h3>
        <p style={{ color: 'var(--text-3)', margin: '0 0 10px', fontSize: 12.5 }}>
          Gedeelde kosten — worden naar machines verdeeld op basis van vloeroppervlak of gelijk over alle machines.
        </p>
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
          <table className="st-tbl">
            <tbody>
              <SH label="Huisvesting (verdeeld op vloeroppervlak)" />
              <SR label="Totale vloeroppervlak"        unit="m²"     value={cfg.shop.totalFloorM2}                  onChange={v => patchShop({ totalFloorM2: v })}                placeholder="500" />
              <SR label="Huur / hypotheek"             unit="€/jaar" value={cfg.shop.annualRentEur}                 onChange={v => patchShop({ annualRentEur: v })}               placeholder="48000" />
              <SR label="Verzekering (gebouw/AVB)"     unit="€/jaar" value={cfg.shop.annualInsuranceEur}            onChange={v => patchShop({ annualInsuranceEur: v })}          placeholder="0" />
              <SR label="Gebouwonderhoud"               unit="€/jaar" value={cfg.shop.annualBuildingMaintenanceEur}  onChange={v => patchShop({ annualBuildingMaintenanceEur: v })} placeholder="0" />
              <SH label="Personeel (gelijk verdeeld per machine)" />
              <SR label="Indirecte personeelskosten"   unit="€/jaar" value={cfg.shop.annualStaffOverheadEur}        onChange={v => patchShop({ annualStaffOverheadEur: v })}      placeholder="0" />
              <SH label="Elektriciteit" />
              <SR label="Piek tarief (dagtarief)"      unit="€/kWh"  value={cfg.shop.electricityRateKwh}           onChange={v => patchShop({ electricityRateKwh: v })}         step={0.01} placeholder="0.22" />
              <SR label="Dal tarief (nacht / weekend)" unit="€/kWh"  value={cfg.shop.electricityDalRateKwh}        onChange={v => patchShop({ electricityDalRateKwh: v })}      step={0.01} placeholder="0.12" />
              <SH label="Standaard werktijden" />
              <SR label="Werkweken / jaar"   unit="wkn" value={cfg.shop.weeksPerYear} onChange={v => patchShop({ weeksPerYear: Math.max(1, v) })} placeholder="52" />
              <SR label="Werkdagen / week"   unit="dgn" value={cfg.shop.daysPerWeek}  onChange={v => patchShop({ daysPerWeek: Math.min(7, Math.max(1, v)) })} placeholder="5" />
              <SR label="Uren / dag (std.)"  unit="u"   value={cfg.shop.hoursPerDay}  onChange={v => patchShop({ hoursPerDay: Math.max(1, v) })} placeholder="8" />
              <tr style={{ cursor: 'default', background: 'var(--bg-sidebar)' }}>
                <td style={{ fontWeight: 500, fontSize: 12.5, color: 'var(--text-3)' }}>Beschikbaar / jaar</td>
                <td style={{ fontSize: 11.5, color: 'var(--text-3)' }}>uur</td>
                <td className="cell-num cell-mono" style={{ padding: '4px 8px', fontWeight: 600 }}>{fmtN(annualHrs)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* KPI summary */}
      <div style={{ paddingTop: 36, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <KPI
          label="Huisvesting per m² / jaar"
          value={shopRateM2 > 0 ? eur(shopRateM2) : '—'}
          sub={shopRateM2 > 0 ? `${eur(shopRateM2 / 12)} / mnd` : undefined}
        />
        <KPI
          label="Beschikbare uren / jaar"
          value={`${fmtN(annualHrs)} u`}
          sub={`${cfg.shop.weeksPerYear} wkn × ${cfg.shop.daysPerWeek} dgn × ${cfg.shop.hoursPerDay} u`}
        />
        <KPI
          label="Totale jaarkosten (excl. machines)"
          value={eur(totalAnnual)}
          sub="huur + verzekering + onderhoud + personeel"
        />
      </div>
    </div>
  )
}
