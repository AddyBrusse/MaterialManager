import { Modal } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { IconExternalLink, IconTrash, IconCheck } from '@tabler/icons-react'
import type { Todo } from '@stockmanager/shared'
import { datumTijd } from '../../utils/verbeterpunt'

interface Props {
  punt: Todo | null
  onSluit: () => void
  onAfvinken: (done: boolean) => void
  onVerwijder: () => void
}

const BRON = {
  nagebouwd: 'Automatisch nagetekend door de browser; kan op details afwijken.',
  geplakt: 'Echte schermafdruk, door de melder geplakt.',
  geen: '',
}

/** Eén verbeterpunt groot: de schermafbeelding en alles wat vanzelf meeging. */
export function VerbeterpuntBekijken({ punt, onSluit, onAfvinken, onVerwijder }: Props) {
  const navigate = useNavigate()
  const c = punt?.context
  return (
    <Modal opened={!!punt} onClose={onSluit} title="Verbeterpunt" size={1100} centered>
      {punt && (
        <div className="vp-venster">
          <div className="vp-groot-zin">{punt.title}</div>
          {punt.schermafbeelding ? (
            <a href={punt.schermafbeelding} target="_blank" rel="noreferrer" className="vp-schets" title="Op ware grootte in een nieuw tabblad">
              <img src={punt.schermafbeelding} alt="Schermafbeelding bij het verbeterpunt" style={{ maxWidth: '100%', maxHeight: '62vh' }} />
            </a>
          ) : (
            <div className="vp-schets-leeg" style={{ height: 80 }}>Zonder schermafbeelding gemeld.</div>
          )}
          <div className="vp-gegevens">
            <span>Pagina</span><span>{punt.paginaNaam ?? '—'} <code>{punt.paginaUrl}</code></span>
            <span>Gemeld door</span><span>{punt.createdByName}{c?.operator ? ` (aan de machine: ${c.operator})` : ''}, {datumTijd(punt.createdAt)}</span>
            {c?.scherm && <><span>Scherm</span><span>{c.scherm.breedte} × {c.scherm.hoogte}{c.scherm.schaal !== 1 ? ` bij ${Math.round(c.scherm.schaal * 100)} %` : ''}{c.browser ? `, ${c.browser}` : ''}</span></>}
            {c && BRON[c.schermafbeelding] && <><span>Afbeelding</span><span>{BRON[c.schermafbeelding]}</span></>}
            {!!c?.fouten.length && (
              <>
                <span>Foutmeldingen vlak ervoor</span>
                <ul>
                  {c.fouten.map((f, i) => (
                    <li key={i}><strong>{new Date(f.tijd).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} {f.titel}</strong> — {f.tekst}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="vp-voet">
            <button className="st-btn sm danger" onClick={onVerwijder}><IconTrash size={13} />Verwijderen</button>
            <div style={{ flex: 1 }} />
            {punt.paginaUrl && (
              <button className="st-btn sm" onClick={() => { onSluit(); navigate(punt.paginaUrl!) }}>
                <IconExternalLink size={13} />Open pagina
              </button>
            )}
            <button className="st-btn primary sm" onClick={() => onAfvinken(!punt.done)}>
              <IconCheck size={13} />{punt.done ? 'Weer openzetten' : 'Afvinken: opgelost'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
