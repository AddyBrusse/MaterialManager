import type { Project, Relatie, UpdateProject } from '@stockmanager/shared'
import type { ActiviteitVM, AandachtVM, GeldVM, ReserveringVM, TodoVM } from '../types'
import { MailImportKaart } from '../components/MailImportKaart'
import { BasisGegevens } from './algemeen/BasisGegevens'
import { Activiteit } from './algemeen/Activiteit'
import { WatMoetErGebeuren } from './algemeen/WatMoetErGebeuren'
import { GeldKaart } from './algemeen/GeldKaart'
import { MateriaalKaart } from './algemeen/MateriaalKaart'
import { Notities } from './algemeen/Notities'

interface Props {
  project: Project
  relaties: Relatie[]
  activiteit: ActiviteitVM[]
  aandacht: AandachtVM[]
  todos: TodoVM[]
  geld: GeldVM
  reserveringen: ReserveringVM[]
  geblokkeerd: boolean
  onGewijzigd: () => void
  onZet: (patch: UpdateProject) => void
  onRelatiesGewijzigd: () => void
  onNaarReserveringen: () => void
}

/**
 * §5.1 — het project op één blad (indeling 2026-10-05, ontwerp op het canvas
 * "Algemeen-tab indeling"). Links het project zelf: gegevens met notities, en
 * wat er gebeurd is. Rechts de stand: wat er moet gebeuren, het geld en het
 * materiaal — die stonden op de tabs Aandacht, Financieel en Reserveringen.
 * Op een smal scherm schuift rechts onder links.
 */
export function AlgemeenTab(props: Props) {
  const { project: p, geblokkeerd } = props
  return (
    <div className="pdv2-algemeen">
      <div className="pdv2-algemeen-hoofd">
        <BasisGegevens
          project={p}
          relaties={props.relaties}
          geblokkeerd={geblokkeerd}
          onZet={props.onZet}
          onRelatiesGewijzigd={props.onRelatiesGewijzigd}
        >
          <Notities waarde={p.notities} geblokkeerd={geblokkeerd} onZet={(notities) => props.onZet({ notities })} />
        </BasisGegevens>
        <MailImportKaart project={p} geblokkeerd={geblokkeerd} onGewijzigd={props.onGewijzigd} />
        <Activiteit activiteit={props.activiteit} />
      </div>
      <div className="pdv2-algemeen-stand">
        <WatMoetErGebeuren aandacht={props.aandacht} todos={props.todos} />
        <GeldKaart geld={props.geld} />
        <MateriaalKaart items={props.reserveringen} onNaarReserveringen={props.onNaarReserveringen} />
      </div>
    </div>
  )
}
