import { useState } from 'react'
import { Menu } from '@mantine/core'
import { IconHistory } from '@tabler/icons-react'
import type { Herberekening } from '@stockmanager/shared'
import { planningApi } from '../../api/planning'
import type { Samenvatting } from '../../utils/auto-planning'
import { meldFout } from '../../utils/fout-melding-toon'
import { toonPlanningMelding } from './PlanningMelding'

const LEEG: Samenvatting = { ingepland: [], later: [], eerder: [], teLaat: 0 }

/**
 * De laatste herberekeningen, ook nadat de melding weg is. De nieuwste die nog
 * staat, kan terug: klikken toont zijn melding opnieuw, met "Ongedaan maken".
 */
export function LaatsteBerekeningen() {
  const [lijst, setLijst] = useState<Herberekening[] | null>(null)
  const laad = () => planningApi.lijst(8).then(setLijst).catch((fout) =>
    meldFout({ actie: 'Laatste berekeningen ophalen', fout, gevolg: 'Er is niets veranderd; de planning zelf staat er gewoon.' }))
  const eerste = lijst?.find((r) => !r.ongedaanOp)
  const tijd = (iso: string) => new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <Menu position="bottom-end" width={380} onOpen={laad}>
      <Menu.Target>
        <button className="st-btn sm" title="Laatste herberekeningen, en ongedaan maken"><IconHistory size={13} /> Laatste</button>
      </Menu.Target>
      <Menu.Dropdown>
        {lijst == null && <Menu.Label>Laden…</Menu.Label>}
        {lijst?.length === 0 && <Menu.Label>Nog niet automatisch gepland.</Menu.Label>}
        {lijst?.map((r) => (
          <Menu.Item key={r.id} disabled={r !== eerste}
            onClick={() => toonPlanningMelding({ herberekening: r, aanleiding: r.aanleiding, samenvatting: (r.samenvatting as Samenvatting) ?? LEEG, geenMachine: [] })}>
            <div style={{ fontSize: 12 }}>{r.aanleiding}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {tijd(r.op)} · {r.door} · {r.wijzigingen.length} stap(pen){r.ongedaanOp ? ' · ongedaan gemaakt' : r === eerste ? ' · kan terug' : ''}
            </div>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
