import { IconClock, IconStack2, IconAlertTriangle, IconInbox, IconArrowsHorizontal } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { QueueKpis } from '../../utils/planningQueueUtils'

function Kpi({ icon, label, val, sub, variant }: { icon: ReactNode; label: string; val: string | number; sub?: string; variant?: 'warn' | 'danger' }) {
  return (
    <div className={`kpi${variant ? ` ${variant}` : ''}`}>
      <div className="kpi-top">
        <span className="kpi-ico">{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-val">{val}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export function QueueKpiStrip({ kpis }: { kpis: QueueKpis }) {
  return (
    <div className="kpi-row">
      <Kpi icon={<IconClock size={14} />} label="Gepland deze week" val={kpis.geplandDezeWeek} sub="stappen in wachtrij" />
      <Kpi icon={<IconStack2 size={14} />} label="Bezetting" val={`${kpis.bezettingPct}%`} sub="t.o.v. effectieve capaciteit" />
      <Kpi icon={<IconAlertTriangle size={14} />} label="Achterstand" val={kpis.achterstand} variant={kpis.achterstand ? 'danger' : undefined} sub="risico op te laat" />
      <Kpi icon={<IconInbox size={14} />} label="Te plannen" val={kpis.tePlannen} sub="backlog" />
      <Kpi icon={<IconArrowsHorizontal size={14} />} label="Gem. doorlooptijd" val={kpis.gemDoorlooptijdDagen} sub="dagen, actieve stappen" />
    </div>
  )
}
