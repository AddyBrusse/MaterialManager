import { useState } from 'react'
import { waarschuwingBijWijziging, type OfferteRegel, type OpdrachtWijziging, type Project, type ProjectVoortgang, type Todo } from '@stockmanager/shared'
import { ArtikelPickerModal } from '../../../../components/projecten/ArtikelPickerModal'
import { BevestigModal } from '../components/BevestigModal'
import type { ZaagReservation } from '../../../../api/reservations'
import { MateriaalSelectieModal } from '../../../../components/materiaal/MateriaalSelectieModal'
import { ObKaart } from './opdracht/ObKaart'
import { ObRegels } from './opdracht/ObRegels'
import { useObDocument } from './opdracht/useObDocument'
import { GeenOpdracht, type GeenOpdrachtActies } from './opdracht/GeenOpdracht'

interface Props {
  project: Project
  voortgang: ProjectVoortgang
  todos: Todo[]
  reserveringen: ZaagReservation[]
  geblokkeerd: boolean
  geenOpdracht: GeenOpdrachtActies
  onVerstuurd: (naar: string | null) => void
  onZetOB: (patch: { notities?: string; opdrachtRef?: string | null; levertijdDatum?: string | null }) => void
  onNaarTab: (tab: 'offertes' | 'productie' | 'reserveringen') => void
  onWijzig: (w: OpdrachtWijziging) => Promise<boolean>
}

/**
 * §5.3 — de opdracht: het document dat de klant krijgt, en de regels die werk
 * worden. De tab bestaat altijd, ook leeg.
 */
export function OpdrachtTab(props: Props) {
  const { project: p, geblokkeerd } = props
  const [kies, setKies] = useState<OfferteRegel | null>(null)
  const [picker, setPicker] = useState(false)
  const [bevestig, setBevestig] = useState<{ w: OpdrachtWijziging; tekst: string } | null>(null)
  const doc = useObDocument(p, props.onVerstuurd)
  const ob = p.opdrachtbevestiging

  if (!ob) return <GeenOpdracht project={p} geblokkeerd={geblokkeerd} {...props.geenOpdracht} />

  // Principe van 2026-09-28: niets blokkeren, maar zeggen wat er al gebeurd is.
  // Is er iets om te melden (al gemaakt, geleverd, gefactureerd) — of haal je
  // een regel weg — dan eerst die zin en een bevestiging; anders meteen doen.
  const wijzig = (w: OpdrachtWijziging) => {
    const tekst = waarschuwingBijWijziging(p, w)
    if (tekst) setBevestig({ w, tekst })
    else void props.onWijzig(w)
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
        onWijzig={wijzig}
        onToevoegen={() => setPicker(true)}
      />
      {picker && (
        <ArtikelPickerModal
          opened
          projectId={p.id}
          offerteId={ob.offerteId}
          relatieId={p.relatieId}
          titel="Regels toevoegen aan de opdracht"
          onClose={() => setPicker(false)}
          onAdded={() => {}}
          onVoegToe={(regels) => void props.onWijzig({ soort: 'erbij', regels })}
        />
      )}
      {bevestig && (
        <BevestigModal
          titel={bevestig.w.soort === 'weg' ? 'Regel van de opdracht halen?' : 'Toch wijzigen?'}
          knop={bevestig.w.soort === 'weg' ? 'Van de opdracht halen' : 'Ja, wijzig'}
          gevaar={bevestig.w.soort === 'weg'}
          onSluit={() => setBevestig(null)}
          onBevestig={() => {
            void props.onWijzig(bevestig.w)
            setBevestig(null)
          }}
        >
          <p>{bevestig.tekst}</p>
          <p>De offerte blijft zoals hij was; de wijziging komt in het logboek van de opdracht.</p>
        </BevestigModal>
      )}
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
