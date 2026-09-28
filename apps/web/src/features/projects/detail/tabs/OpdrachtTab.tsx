import { useState } from 'react'
import type { OfferteRegel, Project, ProjectVoortgang, Todo } from '@stockmanager/shared'
import type { ZaagReservation } from '../../../../api/reservations'
import { MateriaalSelectieModal } from '../../../../components/materiaal/MateriaalSelectieModal'
import { Card } from '../components/Card'
import { geaccepteerdeOfferte } from '../lib/status'
import { ObKaart } from './opdracht/ObKaart'
import { ObRegels } from './opdracht/ObRegels'
import { useObDocument } from './opdracht/useObDocument'

interface Props {
  project: Project
  voortgang: ProjectVoortgang
  todos: Todo[]
  reserveringen: ZaagReservation[]
  geblokkeerd: boolean
  onAanmaken: () => void
  onVerstuurd: (naar: string | null) => void
  onZetOB: (patch: { notities?: string; opdrachtRef?: string | null; levertijdDatum?: string | null }) => void
  onNaarTab: (tab: 'offertes' | 'productie' | 'reserveringen') => void
}

/**
 * §5.3 — de opdracht: het document dat de klant krijgt, en de regels die werk
 * worden. De tab bestaat altijd, ook leeg.
 */
export function OpdrachtTab(props: Props) {
  const { project: p, geblokkeerd } = props
  const [kies, setKies] = useState<OfferteRegel | null>(null)
  const doc = useObDocument(p, props.onVerstuurd)
  const ob = p.opdrachtbevestiging

  if (!ob) {
    // De lege staat komt in PR B (accepteren vanaf hier, directe opdracht).
    const acc = geaccepteerdeOfferte(p)
    return (
      <Card
        titel="Opdrachtbevestiging"
        acties={
          <button
            type="button"
            className={`pdv2-btn s ${acc ? 'primair' : ''}`}
            onClick={props.onAanmaken}
            disabled={!acc || geblokkeerd}
          >
            Opdracht aanmaken
          </button>
        }
      >
        <div className="pdv2-empty">
          Ontstaat zodra de klant een offerte accepteert. Dan bevriezen de regels, kies je per
          regel het materiaal en worden de productieorders met hun stappen aangemaakt.
        </div>
      </Card>
    )
  }

  // Een openstaande todo voor deze regel wordt afgevinkt als het materiaal
  // gekozen is; zonder todo (al afgevinkt, of een regel van later) kan het ook.
  const todoVan = (regelId: string) =>
    props.todos.find((t) => !t.done && t.soort === 'materiaal_selecteren' && t.offerteRegelId === regelId)

  return (
    <>
      <ObKaart
        project={p}
        geblokkeerd={geblokkeerd}
        onOpenen={doc.openen}
        onPdf={doc.downloaden}
        onVersturen={doc.klaarzetten}
        onZet={props.onZetOB}
        onNaarOffertes={() => props.onNaarTab('offertes')}
      />
      <ObRegels
        project={p}
        voortgang={props.voortgang}
        reserveringen={props.reserveringen}
        geblokkeerd={geblokkeerd}
        onKiesMateriaal={setKies}
        onNaarReserveringen={() => props.onNaarTab('reserveringen')}
        onNaarOrder={() => props.onNaarTab('productie')}
      />
      {doc.dialoog}
      {kies && kies.artikelId && (
        <MateriaalSelectieModal
          projectId={p.id}
          artikelId={kies.artikelId}
          artikelNaam={kies.naam}
          aantal={kies.qty}
          calculatieNr={ob.id}
          todoId={todoVan(kies.id)?.id}
          offerteRegelId={kies.id}
          onClose={() => setKies(null)}
        />
      )}
    </>
  )
}
