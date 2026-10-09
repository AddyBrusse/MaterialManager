import { useLocalStorage } from '@mantine/hooks'
import type { Machine } from '../../api/machines'
import type { DerivedSlot } from '../../utils/planningQueueUtils'
import type { Baan, Kaart, Kolom } from './planning-logica'
import type { StapRegel } from './InfoHover'
import { KanbanBord } from './KanbanBord'
import { StatusBord } from './StatusBord'

export interface WerkbordProps {
  banen: Baan[]
  kolommen: Record<Kolom, Kaart[]>
  machines: Machine[]
  schema: Map<string, DerivedSlot>
  ws: Date
  bezig: boolean
  info: (orderId: string) => { klant: string; stappen: StapRegel[] }
  onLos: (k: Kaart, prioriteit: number, machine?: Machine) => void
  onWachtUit: (k: Kaart) => void
}

/** Het werkbord onder de Gantt (2026-10-09): KanBan (plannen, standaard) of Status (kijken). */
export function Werkbord(p: WerkbordProps) {
  const [weergave, setWeergave] = useLocalStorage<'kanban' | 'status'>({ key: 'sm_wb_weergave', defaultValue: 'kanban' })
  return (
    <div className="wb-paneel">
      <div className="wb-kop">
        <div className="seg">
          <button data-active={weergave === 'kanban'} onClick={() => setWeergave('kanban')}>KanBan</button>
          <button data-active={weergave === 'status'} onClick={() => setWeergave('status')}>Status</button>
        </div>
        <span className="wb-uitleg">
          {weergave === 'kanban'
            ? 'Hoger = eerder · naar een andere baan = andere machine van dezelfde soort · 1,5 s stilstaan = meer info'
            : 'Waar elke stap staat; plannen doe je in de KanBan'}
        </span>
      </div>
      {weergave === 'kanban'
        ? <KanbanBord banen={p.banen} machines={p.machines} schema={p.schema} ws={p.ws} bezig={p.bezig} info={p.info} onLos={p.onLos} onWachtUit={p.onWachtUit} />
        : <StatusBord kolommen={p.kolommen} machines={p.machines} schema={p.schema} ws={p.ws} info={p.info} onWachtUit={p.onWachtUit} />}
    </div>
  )
}
