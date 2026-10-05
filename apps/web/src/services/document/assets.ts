/**
 * Lettertypes en logo voor de documenten (offerte, opdracht, factuur, pakbon,
 * picklist, inkoop) — de huisstijl uit `01-design files claude design/
 * design_handoff_offerte/` (2026-10-05).
 *
 * De pdf wordt in de browser gemaakt en is synchroon (hij moet direct in een
 * venster of een mail kunnen). Daarom laden we de bestanden één keer vooraf,
 * bij het starten van de app; tot ze binnen zijn valt de opmaak terug op
 * Helvetica zonder logo — lelijker, maar nooit een lege pdf.
 */
import plexSansRegular from '../../assets/fonts/IBMPlexSans-Regular.ttf?url'
import plexSansMedium from '../../assets/fonts/IBMPlexSans-Medium.ttf?url'
import plexSansSemiBold from '../../assets/fonts/IBMPlexSans-SemiBold.ttf?url'
import plexMonoRegular from '../../assets/fonts/IBMPlexMono-Regular.ttf?url'
import plexMonoMedium from '../../assets/fonts/IBMPlexMono-Medium.ttf?url'
import plexMonoSemiBold from '../../assets/fonts/IBMPlexMono-SemiBold.ttf?url'
import groteskSemiBold from '../../assets/fonts/SpaceGrotesk-SemiBold.ttf?url'
import groteskBold from '../../assets/fonts/SpaceGrotesk-Bold.ttf?url'
import logoUrl from '../../assets/logo-boers-pdf.png?url'

export type Familie = 'sans' | 'mono' | 'display'
export type Gewicht = 'normal' | 'medium' | 'semibold' | 'bold'

export interface FontBestand {
  familie: Familie
  gewicht: Gewicht
  /** Base64 van het ttf-bestand. */
  data: string
}

export interface DocumentAssets {
  fonts: FontBestand[]
  /** Data-URL van het logo (png), met de verhouding breedte/hoogte. */
  logo: { data: string; verhouding: number } | null
}

const BRONNEN: { familie: Familie; gewicht: Gewicht; url: string }[] = [
  { familie: 'sans', gewicht: 'normal', url: plexSansRegular },
  { familie: 'sans', gewicht: 'medium', url: plexSansMedium },
  { familie: 'sans', gewicht: 'semibold', url: plexSansSemiBold },
  { familie: 'mono', gewicht: 'normal', url: plexMonoRegular },
  { familie: 'mono', gewicht: 'medium', url: plexMonoMedium },
  { familie: 'mono', gewicht: 'semibold', url: plexMonoSemiBold },
  { familie: 'display', gewicht: 'semibold', url: groteskSemiBold },
  { familie: 'display', gewicht: 'bold', url: groteskBold },
]

let cache: DocumentAssets = { fonts: [], logo: null }
let bezig: Promise<void> | null = null

/** Wat er nu geladen is; leeg tot `laadDocumentAssets` klaar is. */
export function documentAssets(): DocumentAssets {
  return cache
}

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Eén keer bij het starten. Mislukt het (offline, bestand weg), dan blijft de
 * terugval staan en meldt de console het — de documenten werken nog.
 */
export function laadDocumentAssets(): Promise<void> {
  if (bezig) return bezig
  bezig = (async () => {
    try {
      const fonts = await Promise.all(
        BRONNEN.map(async (b) => ({ familie: b.familie, gewicht: b.gewicht, data: base64(await (await fetch(b.url)).arrayBuffer()) })),
      )
      const logoBuf = await (await fetch(logoUrl)).arrayBuffer()
      const verhouding = await new Promise<number>((ok) => {
        const img = new Image()
        img.onload = () => ok(img.naturalWidth / img.naturalHeight)
        img.onerror = () => ok(900 / 313)
        img.src = logoUrl
      })
      cache = { fonts, logo: { data: `data:image/png;base64,${base64(logoBuf)}`, verhouding } }
    } catch (fout) {
      console.warn('Documentopmaak: lettertypes of logo niet geladen, terugval op Helvetica', fout)
      bezig = null
    }
  })()
  return bezig
}
