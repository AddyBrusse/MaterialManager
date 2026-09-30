import type { LaadFout } from './fout-melding'

/**
 * Wachttijden vóór een nieuwe poging, in ms. Bij het opstarten van `npm run dev`
 * is de browser vaak eerder klaar dan de API: Vite herlaadt een open tabblad
 * zodra hij zelf draait, en de eerste verzoeken daarna gaan net over de 3 s
 * (2026-09-30: machines en artikelen, na F5 alles goed). Zonder herhaling stond
 * er dan "je werkt op een kopie" terwijl de server gewoon nog opstartte.
 */
export const HERHAAL_NA_MS = [2000, 4000]

function isLaadFout(u: unknown): u is LaadFout {
  return !!u && typeof u === 'object' && 'wat' in u
}

/**
 * Laadt alles tegelijk, en probeert alleen wat mislukte opnieuw. Geeft de
 * fouten terug die ook na de laatste poging nog staan — pas die zijn het melden
 * waard. `naRonde` draait na elke ronde, zodat wat wél lukte meteen op het
 * scherm komt in plaats van pas na de laatste poging.
 */
export async function laadMetHerhaling(
  taken: (() => Promise<unknown>)[],
  opties: {
    wachttijden?: number[]
    wacht?: (ms: number) => Promise<void>
    naRonde?: () => void
    gestopt?: () => boolean
  } = {},
): Promise<LaadFout[]> {
  const { wachttijden = HERHAAL_NA_MS, naRonde, gestopt = () => false } = opties
  const wacht = opties.wacht ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  let open = taken
  let fouten: LaadFout[] = []
  for (let ronde = 0; ; ronde++) {
    const uitkomsten = await Promise.all(open.map((t) => t()))
    const mislukt = open.filter((_, i) => isLaadFout(uitkomsten[i]))
    fouten = uitkomsten.filter(isLaadFout)
    naRonde?.()
    if (mislukt.length === 0 || ronde >= wachttijden.length || gestopt()) return fouten
    await wacht(wachttijden[ronde])
    if (gestopt()) return fouten
    open = mislukt
  }
}
