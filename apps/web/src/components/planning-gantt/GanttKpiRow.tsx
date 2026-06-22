import { IconClock, IconStack2, IconAlertTriangle, IconInbox, IconCalendar } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { GanttKpis } from '../../utils/planningGanttUtils'

interface KpiProps {
  icon: ReactNode
  label: string
  val: string | number
  unit?: string
  sub?: string
  bar?: { pct: number; status: 'ok' | 'warn' | 'over' }
  variant?: 'warn' | 'danger'
}

function Kpi({ icon, label, val, unit, sub, bar, variant }: KpiProps) {
  return (
    <div className={`kpi${variant ? ` ${variant}` : ''}`}>
      <div className="kpi-top">
        <span className="kpi-ico">{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-val">{val}{unit && <span className="u">{unit}</span>}</div>
      {bar && <div className="bar"><i className={bar.status} style={{ width: `${Math.min(100, bar.pct)}%` }} /></div>}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export function GanttKpiRow({ kpis }: { kpis: GanttKpis }) {
  return (
    <div className="kpi-row">
      <Kpi icon={<IconClock size={14} />} label="Gepland deze week" val={kpis.geplandUren} unit="u" sub="alle machines" />
      <Kpi
        icon={<IconStack2 size={14} />} label="Bezetting" val={kpis.bezetting} unit="%"
        bar={{ pct: kpis.bezetting, status: kpis.bezetting > 100 ? 'over' : kpis.bezetting > 85 ? 'warn' : 'ok' }}
        sub="t.o.v. effectieve capaciteit"
      />
      <Kpi
        icon={<IconAlertTriangle size={14} />} label="Achterstand" val={kpis.achterstand}
        variant={kpis.achterstand ? 'danger' : undefined} sub="stappen over tijd"
      />
      <Kpi icon={<IconInbox size={14} />} label="Te plannen" val={kpis.tePlannen} sub="stappen in backlog" />
      <Kpi icon={<IconCalendar size={14} />} label="Leveringen" val={kpis.leveringen} sub="deadlines deze week" />
    </div>
  )
}
