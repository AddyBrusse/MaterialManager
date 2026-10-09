import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalStorage } from '@mantine/hooks'
import { Menu, Popover } from '@mantine/core'
import { IconChevronDown, IconExternalLink, IconInfoCircle, IconRefresh } from '@tabler/icons-react'
import { usePopoutRoutes } from '../../hooks/usePopout'
import { focusPopout, openPopout, requestClosePopout } from '../../utils/popout'
import { OpdrachtGantt } from './OpdrachtGantt'
import { Werkbord } from './Werkbord'
import { LaatsteBerekeningen } from './LaatsteBerekeningen'
import { usePlanningData } from './usePlanningData'
import { werkbordActies } from './PlanningActies'
import './opdracht-planning.css'

export const WERKBORD_PAD = '/planning-werkbord'
const ZOOM = [['1', 'Dag'], ['7', 'Week'], ['14', '14 dagen'], ['31', 'Maand']] as const

/**
 * Planning per opdracht (2026-10-08): de Gantt boven, het werkbord eronder.
 * Het werkbord kan naar een eigen venster; dan krijgt de Gantt de ruimte.
 */
export function OpdrachtPlanning() {
  const d = usePlanningData()
  const navigate = useNavigate()
  const [zoom, setZoom] = useLocalStorage<string>({ key: 'sm_op_zoom', defaultValue: '14' })
  const [dicht, setDicht] = useState<Set<string>>(new Set())
  const [verschuif, setVerschuif] = useState(0)
  const [bezig, setBezig] = useState(false)
  const los = usePopoutRoutes().has(WERKBORD_PAD)
  const acties = werkbordActies(setBezig, d.ververs)
  const dagen = Number(zoom) || 14
  // Dag: vandaag vooraan; de rest begint een dag terug, zodat gisteren zichtbaar blijft.
  const van = (dagen === 1 ? 0 : -1) + verschuif
  const stapNav = dagen === 1 ? 1 : dagen <= 14 ? 7 : 14
  const setVan = (f: (x: number) => number) => setVerschuif((v) => f(v))

  const klap = (id: string) => setDicht((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const teLaat = d.gantt.filter((o) => o.teLaat > 0).length

  return (
    <div className="op" data-los={los || undefined}>
      <div className="op-balk">
        <div className="seg">
          <button className="st-btn sm primary" disabled={bezig} onClick={() => acties.herbereken(false)}><IconRefresh size={13} /> {bezig ? 'Bezig…' : 'Herbereken'}</button>
          <Menu position="bottom-start">
            <Menu.Target><button className="st-btn sm" aria-label="Meer"><IconChevronDown size={13} /></button></Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => acties.herbereken(true)}>Herbereken op leverdatum (prioriteiten opnieuw)</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
        <div className="seg">{ZOOM.map(([v, l]) => <button key={v} data-active={zoom === v} onClick={() => setZoom(v)}>{l}</button>)}</div>
        <div className="seg">
          <button onClick={() => setVan((x) => x - stapNav)}>‹</button>
          <button onClick={() => setVerschuif(0)}>Vandaag</button>
          <button onClick={() => setVan((x) => x + stapNav)}>›</button>
        </div>
        <Popover position="bottom-start" shadow="md" withArrow>
          <Popover.Target><button className="st-btn sm"><IconInfoCircle size={13} /> Legenda</button></Popover.Target>
          <Popover.Dropdown>
            <div className="op-sleutel">
              <span><i className="bezig" />bezig</span>
              <span><i className="uitloop" />loopt uit (niet op tijd gereed)</span>
              <span><i className="achter" />had al moeten beginnen</span>
              <span><i className="materiaal" />wacht op materiaal</span>
              <span><i className="lev" />afgesproken levering</span>
            </div>
          </Popover.Dropdown>
        </Popover>
        <span className="op-stand">
          {d.gantt.length} opdrachten{teLaat > 0 && <> · <b>{teLaat} te laat</b></>}
          {d.achter > 0 && <> · <b title="Herbereken schuift wat erna komt op">{d.achter} {d.achter === 1 ? 'stap loopt' : 'stappen lopen'} achter</b></>}
        </span>
        <LaatsteBerekeningen />
        {!los && <button className="st-btn sm" onClick={() => openPopout(WERKBORD_PAD)}><IconExternalLink size={13} /> Werkbord in eigen venster</button>}
      </div>
      <div className="op-gantt">
        <OpdrachtGantt opdrachten={d.gantt} ws={d.ws} van={van} dagen={dagen} dicht={dicht} info={d.info} onKlap={klap}
          onOpen={(id) => navigate(`/projecten/${id}`)} onArtikel={(id) => navigate(`/artikelen/${id}`)} />
      </div>
      {los ? (
        <div className="op-los">
          Het werkbord staat in een eigen venster.
          <button className="st-btn sm" onClick={() => focusPopout(WERKBORD_PAD)}>Venster tonen</button>
          <button className="st-btn sm" onClick={() => requestClosePopout(WERKBORD_PAD)}>Terughalen</button>
        </div>
      ) : (
        <div className="op-werkbord">
          <Werkbord banen={d.banen} kolommen={d.kolommen} machines={d.machines} schema={d.schema} ws={d.ws} bezig={bezig}
            info={d.info} onLos={acties.los} onWachtUit={acties.wachtUit} />
        </div>
      )}
    </div>
  )
}
