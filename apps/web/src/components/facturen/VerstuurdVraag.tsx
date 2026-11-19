import { BevestigModal } from '../../features/projects/detail/components/BevestigModal'

interface Props {
  id: string
  /** De naam van het .eml-bestand in de downloads. */
  bestand: string
  naar: string | null
  mailto: string
  onSluit: () => void
  onVerstuurd: () => void
}

/**
 * "Heb je hem verstuurd?" na het klaarzetten van de mail — voor een
 * projectfactuur en een losse factuur hetzelfde. Pas bij "Ja, verstuurd" staat
 * hij vast; wie hem toch niet verstuurt, houdt een factuur mét nummer.
 */
export function VerstuurdVraag({ id, bestand, naar, mailto, onSluit, onVerstuurd }: Props) {
  return (
    <BevestigModal titel="Heb je hem verstuurd?" knop="Ja, verstuurd" annuleer="Nog niet" onSluit={onSluit} onBevestig={onVerstuurd}>
      <p>
        De mail staat in je downloads als <strong>{bestand}</strong>. Open hem: Outlook toont hem als nieuwe mail
        aan <strong>{naar}</strong>, met de pdf erin. Druk daar op Verzenden.
      </p>
      <p>Pas als je hier op <strong>Ja, verstuurd</strong> drukt, staat hij als verstuurd en loopt de betaaltermijn.</p>
      <p style={{ fontSize: 11 }}>
        Hij heeft nu het nummer <strong>{id}</strong>, ook als je hem niet verstuurt. Gaat hij toch niet weg, dan kun
        je het nummer intrekken zolang het het laatst uitgegeven nummer is.
      </p>
      <p style={{ fontSize: 11 }}>
        Opent het bestand niet als nieuwe mail? <a href={mailto}>Open een lege mail</a> en voeg de pdf (knop Pdf)
        zelf toe.
      </p>
    </BevestigModal>
  )
}
