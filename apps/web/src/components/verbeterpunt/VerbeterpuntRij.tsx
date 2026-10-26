import { useNavigate } from 'react-router-dom'
import { IconTrash, IconExternalLink, IconAlertTriangle } from '@tabler/icons-react'
import type { Todo } from '@stockmanager/shared'
import { datumTijd } from '../../utils/verbeterpunt'

interface Props {
  punt: Todo
  onBekijk: () => void
  onAfvinken: (done: boolean) => void
  onVerwijder: () => void
}

/** Eén verbeterpunt: miniatuur, de zin, waar en door wie. Klik op de miniatuur = groot. */
export function VerbeterpuntRij({ punt, onBekijk, onAfvinken, onVerwijder }: Props) {
  const navigate = useNavigate()
  const fouten = punt.context?.fouten.length ?? 0
  return (
    <div className="prj-off-card vp-rij" style={{ opacity: punt.done ? 0.6 : 1 }}>
      <input
        type="checkbox"
        checked={punt.done}
        onChange={(e) => onAfvinken(e.target.checked)}
        title={punt.done ? 'Weer openzetten' : 'Afvinken: opgelost'}
        style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
      />
      <button className="vp-mini" onClick={onBekijk} title="Groot bekijken">
        {punt.schermafbeelding ? <img src={punt.schermafbeelding} alt="" loading="lazy" /> : <span>geen beeld</span>}
      </button>
      <div className="vp-rij-tekst">
        <button className="vp-zin" onClick={onBekijk} style={{ textDecoration: punt.done ? 'line-through' : 'none' }}>
          {punt.title}
        </button>
        <div className="vp-rij-meta">
          <span>{punt.paginaNaam ?? punt.paginaUrl}</span>
          <span>·</span>
          <span>{punt.createdByName ?? '—'}{punt.context?.operator ? ` (${punt.context.operator})` : ''}, {datumTijd(punt.createdAt)}</span>
          {fouten > 0 && (
            <span className="st-badge danger" style={{ fontSize: 10.5 }}>
              <IconAlertTriangle size={11} />{fouten === 1 ? '1 foutmelding' : `${fouten} foutmeldingen`}
            </span>
          )}
        </div>
      </div>
      {punt.paginaUrl && (
        <button className="st-btn xs ghost" onClick={() => navigate(punt.paginaUrl!)} title={punt.paginaUrl}>
          <IconExternalLink size={13} />Open pagina
        </button>
      )}
      <button className="st-icon-btn danger" title="Verwijderen, met schermafbeelding" onClick={onVerwijder}>
        <IconTrash size={13} />
      </button>
    </div>
  )
}
