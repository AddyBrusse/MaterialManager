import { useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconCopy, IconTrash } from '@tabler/icons-react'
import type { Offerte } from '@stockmanager/shared'

interface Props {
  offerte: Offerte
  erIsGeaccepteerd: boolean
  geblokkeerd: boolean
  onVerzend: () => void
  onAccepteer: () => void
  onKopieer: () => void
  onNaarProject: () => void
  onIntrekken: () => void
  onVerwijder: () => void
}

/**
 * De knoppen achter één versie.
 *
 * Vooruit is per versie een keuze die alleen een mens maakt: wélke versie gaat
 * de deur uit, wélke accepteert de klant. Weg kan ook, maar op twee manieren:
 * een concept wordt verwijderd, een verstuurde versie ingetrokken — de klant
 * heeft hem, dus hij blijft zichtbaar als vervallen. Een geaccepteerde versie
 * heeft geen van beide: daar draait de opdracht op.
 */
export function OfferteActies({
  offerte: o,
  erIsGeaccepteerd,
  geblokkeerd,
  onVerzend,
  onAccepteer,
  onKopieer,
  onNaarProject,
  onIntrekken,
  onVerwijder,
}: Props) {
  return (
    <td className="pdv2-acties">
      {o.status === 'concept' && (
        <button
          type="button"
          className="pdv2-btn s"
          // Niet uitgeschakeld bij een lege versie of zonder referentie: een
          // grijze knop zegt niet wáárom. Klikken geeft een melding die zegt wat
          // er eerst moet (zie offerte-voorwaarden).
          disabled={geblokkeerd}
          onClick={onVerzend}
        >
          Versturen
        </button>
      )}
      {o.status === 'verzonden' && !erIsGeaccepteerd && (
        <button type="button" className="pdv2-btn s primair" disabled={geblokkeerd} onClick={onAccepteer}>
          Accepteren
        </button>
      )}
      {o.status === 'verzonden' && (
        <button
          type="button"
          className="pdv2-btn s stil"
          disabled={geblokkeerd}
          title="Deze versie geldt niet meer; hij blijft zichtbaar als vervallen"
          onClick={onIntrekken}
        >
          Intrekken
        </button>
      )}
      <KopieerKnop versie={o.versie} geblokkeerd={geblokkeerd} onKopieer={onKopieer} onNaarProject={onNaarProject} />
      {o.status === 'concept' && (
        <button
          type="button"
          className="pdv2-btn s stil"
          disabled={geblokkeerd}
          title={`v${o.versie} verwijderen`}
          aria-label={`v${o.versie} verwijderen`}
          onClick={onVerwijder}
        >
          <IconTrash size={12} />
        </button>
      )}
    </td>
  )
}

/**
 * Kopieer blijft één klik voor wat het vaakst gebeurt — een nieuwe versie in
 * dit project, een staffel. Het pijltje ernaast opent de minder gewone weg:
 * dezelfde regels als begin van een nieuw project.
 */
function KopieerKnop({
  versie,
  geblokkeerd,
  onKopieer,
  onNaarProject,
}: {
  versie: number
  geblokkeerd: boolean
  onKopieer: () => void
  onNaarProject: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const dicht = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', dicht)
    return () => document.removeEventListener('mousedown', dicht)
  }, [open])

  return (
    <div className="pdv2-splits" ref={ref}>
      <button
        type="button"
        className="pdv2-btn s"
        disabled={geblokkeerd}
        title={`Nieuwe versie in dit project, op basis van v${versie}`}
        onClick={onKopieer}
      >
        <IconCopy size={12} />
        Kopieer
      </button>
      <button
        type="button"
        className="pdv2-btn s"
        disabled={geblokkeerd}
        aria-label="Meer kopieeropties"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
      >
        <IconChevronDown size={12} />
      </button>
      {open && (
        <div className="pdv2-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onKopieer()
            }}
          >
            Nieuwe versie in dit project
            <small>bijvoorbeeld een staffel met een ander aantal</small>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onNaarProject()
            }}
          >
            Naar nieuw project…
            <small>herhaalorder, of dezelfde onderdelen voor een andere klant</small>
          </button>
        </div>
      )}
    </div>
  )
}
