import { create } from 'zustand'
import { maakSchermafbeelding } from '../services/verbeterpunt/schermafbeelding'
import { paginaAdres } from '../utils/verbeterpunt'
import { recenteFouten, type RecenteFout } from '../utils/recente-fouten'

/**
 * Het venster "Dit klopt niet" (2026-10-24): één per browservenster, te openen
 * met de knop of met F8 (ook als er al een ander venster open staat).
 */

/** Wat de omgeving weet die de knop niet weet: de paginanaam, op de terminal wie er staat. */
export type VerbeterpuntBron = () => { paginaNaam: string | null; operator?: string }

type Beeld = { blob: Blob; bron: 'nagebouwd' | 'geplakt' }

interface State {
  open: boolean
  /** Telt per keer openen, zodat een late schermafbeelding van een vorige keer niet binnenvalt. */
  ronde: number
  pagina: { url: string; naam: string | null }
  operator?: string
  /** Vastgelegd bij openen: wat er daarna misgaat (opslaan zelf) hoort er niet bij. */
  fouten: RecenteFout[]
  scherm: { breedte: number; hoogte: number; schaal: number }
  beeld: Beeld | null
  /** De nagetekende afbeelding, om naar terug te kunnen na plakken of weghalen. */
  nagebouwd: Blob | null
  bezig: boolean
  beeldFout: string | null
  bron: VerbeterpuntBron
  zetBron: (bron: VerbeterpuntBron) => void
  start: () => void
  zetBeeld: (beeld: Beeld | null) => void
  sluit: () => void
}

export const useVerbeterpunt = create<State>()((set, get) => ({
  open: false,
  ronde: 0,
  pagina: { url: '/', naam: null },
  fouten: [],
  scherm: { breedte: 0, hoogte: 0, schaal: 1 },
  beeld: null,
  nagebouwd: null,
  bezig: false,
  beeldFout: null,
  bron: () => ({ paginaNaam: null }),
  zetBron: (bron) => set({ bron }),

  start: () => {
    if (get().open) return
    const ronde = get().ronde + 1
    const { paginaNaam, operator } = get().bron()
    set({
      open: true, ronde, operator,
      pagina: { url: paginaAdres(window.location), naam: paginaNaam },
      fouten: recenteFouten(),
      scherm: { breedte: window.innerWidth, hoogte: window.innerHeight, schaal: window.devicePixelRatio || 1 },
      beeld: null, nagebouwd: null, bezig: true, beeldFout: null,
    })
    // Het venster gaat meteen open zodat typen kan; de afbeelding laat het
    // venster zelf weg (NIET_OP_SCHERMAFBEELDING) en komt erbij zodra hij klaar is.
    maakSchermafbeelding().then(
      (blob) => {
        if (get().ronde !== ronde || !get().open) return
        // Is er intussen al iets geplakt, dan wint dat.
        set((s) => ({ nagebouwd: blob, bezig: false, beeld: s.beeld ?? { blob, bron: 'nagebouwd' } }))
      },
      (e: unknown) => {
        if (get().ronde !== ronde) return
        console.error('[Schermafbeelding maken]', e)
        set({ bezig: false, beeldFout: e instanceof Error ? e.message : String(e) })
      },
    )
  },
  zetBeeld: (beeld) => set({ beeld }),
  sluit: () => set({ open: false, beeld: null, nagebouwd: null, bezig: false, beeldFout: null }),
}))
