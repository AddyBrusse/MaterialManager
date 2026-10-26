import type { VolumeFormula } from '../schemas/profile'

/**
 * De maat van een staaf of stuk zoals elk scherm hem toont: Ø50, 40×40,
 * 250×30, Ø60/Ø40. Zonder eenheid; die zet het scherm erachter.
 *
 * Eén plek, want tot 2026-10-19 ging de zaagbon ervan uit dat alles rond was:
 * een platte exoot stond dan als "Ø0 mm" op Reserveringen, Zaagflow en
 * Zaagplanner, en de nacalculatie rekende hem op € 0.
 */
export function afmetingTekst(volumeFormula: VolumeFormula | string, dims: Record<string, number>): string {
  switch (volumeFormula) {
    case 'round':  return `Ø${dims.diameter}`
    case 'square': return `${dims.side}×${dims.side}`
    case 'flat':   return `${dims.width}×${dims.height}`
    case 'tube':   return `Ø${dims.outerDiameter}/Ø${dims.innerDiameter}`
    default:       return Object.values(dims).join('×')
  }
}

/**
 * De maat op een zaagbon. De reservering bewaart van de staaf alleen de
 * profielnaam en een diameter (0 bij alles wat niet rond is), dus de maat komt
 * van de staaf zelf. Bestaat die niet meer, dan wat de bon zelf weet: de
 * diameter als die er is, anders alleen de vorm — nooit "Ø0".
 */
export function zaagbonAfmeting(
  bon: { barVorm: string; diameter: number },
  staaf: { volumeFormula: VolumeFormula | string; dimensions: Record<string, number> } | null,
): string {
  if (staaf) return `${afmetingTekst(staaf.volumeFormula, staaf.dimensions)} mm`
  if (bon.diameter > 0) return `Ø${bon.diameter} mm`
  return bon.barVorm
}
