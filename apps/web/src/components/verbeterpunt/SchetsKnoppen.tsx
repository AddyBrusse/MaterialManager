import { IconArrowBackUp, IconPhotoOff, IconPhoto } from '@tabler/icons-react'
import { useVerbeterpunt } from '../../stores/verbeterpunt'
import type { Kader } from '../../utils/verbeterpunt'

interface Props {
  kaders: Kader[]
  onKaders: (k: Kader[]) => void
}

/** De regel onder de schermafbeelding: uitleg, kaders terugdraaien, afbeelding weg of terug. */
export function SchetsKnoppen({ kaders, onKaders }: Props) {
  const { beeld, nagebouwd, zetBeeld } = useVerbeterpunt()
  return (
    <div className="vp-knoppen">
      <span className="vp-uitleg">
        {beeld
          ? <>Sleep een kader om wat je bedoelt. Klopt het plaatje niet? Maak er zelf een met <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> en plak hem hier met <kbd>Ctrl</kbd>+<kbd>V</kbd>.</>
          : <>Plak een schermafdruk met <kbd>Ctrl</kbd>+<kbd>V</kbd>, of verstuur alleen de tekst.</>}
      </span>
      {kaders.length > 0 && (
        <>
          <button className="st-btn xs ghost" onClick={() => onKaders(kaders.slice(0, -1))}>
            <IconArrowBackUp size={13} />Laatste kader weg
          </button>
          <button className="st-btn xs ghost" onClick={() => onKaders([])}>Alle kaders weg</button>
        </>
      )}
      {beeld && (
        <button className="st-btn xs ghost" onClick={() => { zetBeeld(null); onKaders([]) }}>
          <IconPhotoOff size={13} />Zonder schermafbeelding
        </button>
      )}
      {nagebouwd && beeld?.blob !== nagebouwd && (
        <button className="st-btn xs ghost" onClick={() => { zetBeeld({ blob: nagebouwd, bron: 'nagebouwd' }); onKaders([]) }}>
          <IconPhoto size={13} />Terug naar de automatische
        </button>
      )}
    </div>
  )
}
