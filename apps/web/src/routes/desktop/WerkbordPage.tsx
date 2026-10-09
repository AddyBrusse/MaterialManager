import { useState } from 'react'
import { Werkbord } from '../../components/opdracht-planning/Werkbord'
import { usePlanningData } from '../../components/opdracht-planning/usePlanningData'
import { werkbordActies } from '../../components/opdracht-planning/PlanningActies'
import { LaatsteBerekeningen } from '../../components/opdracht-planning/LaatsteBerekeningen'
import '../../components/opdracht-planning/opdracht-planning.css'

/**
 * Het werkbord in een eigen venster (2026-10-08), naast de Gantt in het
 * hoofdvenster. Eigen kopie van de projecten, ververst elke 10 s en meteen na
 * een herberekening in het andere venster (`utils/planning-sein.ts`).
 */
export function WerkbordPage() {
  const d = usePlanningData()
  const [bezig, setBezig] = useState(false)
  const acties = werkbordActies(setBezig, d.ververs)
  return (
    <div className="op op-alleen-werkbord">
      <div className="op-balk">
        <span className="op-titel">Werkbord</span>
        <span className="op-stand">gekoppeld aan de planning · ververst elke 10 s</span>
        <LaatsteBerekeningen />
      </div>
      <div className="op-werkbord">
        <Werkbord banen={d.banen} kolommen={d.kolommen} machines={d.machines} schema={d.schema} ws={d.ws} bezig={bezig}
          info={d.info} onLos={acties.los} onWachtUit={acties.wachtUit} />
      </div>
    </div>
  )
}
