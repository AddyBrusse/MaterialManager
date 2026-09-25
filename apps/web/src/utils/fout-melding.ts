import { ApiFout } from '../api/client'

/**
 * Een foutmelding in drie delen — de afspraak uit CLAUDE.md:
 *
 *   **Wat** ging er mis — in de woorden van de server als die iets zei, anders
 *   in de onze. Nooit alleen "mislukt".
 *   **Waar** ging het mis — de handeling in gewone taal, met het verzoek erbij
 *   zodat wie het doorgeeft niet hoeft te raden welk scherm of welke knop.
 *   **Gevolg** — wat er wél en níet is gebeurd. Dat is het deel dat het vaakst
 *   ontbreekt en het meest telt: moet je het opnieuw doen, is er iets half
 *   opgeslagen, klopt het scherm nog?
 *
 * Een pure functie, los van Mantine, zodat de tekst te testen is.
 */
export interface FoutTekst {
  titel: string
  wat: string
  waar: string
  gevolg: string
}

export function foutTekst(p: { actie: string; fout: unknown; gevolg: string }): FoutTekst {
  const { actie, fout, gevolg } = p
  if (fout instanceof ApiFout) {
    return {
      titel: `${actie} mislukt`,
      wat: fout.reden ? `${fout.uitleg} (${fout.reden})` : fout.uitleg,
      waar: `${actie} · ${fout.verzoek}${fout.status ? ` → ${fout.status} ${fout.code}` : ` → ${fout.code}`}`,
      gevolg,
    }
  }
  return {
    titel: `${actie} mislukt`,
    // Geen serverfout maar iets in de browser zelf — een fout in onze code,
    // of een wijziging op een project dat er niet meer is.
    wat: fout instanceof Error ? fout.message : String(fout),
    waar: `${actie} · in de browser, vóór er iets naar de server ging`,
    gevolg,
  }
}

/**
 * Een lijst die bij het opstarten niet van de server kwam. De laadfuncties
 * melden zelf niets, maar geven dit terug: als de server onbereikbaar is
 * falen ze allemaal tegelijk, en zes meldingen onder elkaar leest niemand.
 */
export interface LaadFout {
  /** Wat er niet geladen is, in het meervoud: "projecten", "artikelen". */
  wat: string
  /** Hoeveel er uit de bewaarde browserkopie komt. */
  aantalLokaal: number
  fout: unknown
}

/** Het gevolg van één of meer mislukte laadacties, in één zin. */
export function laadGevolg(fouten: LaadFout[]): string {
  const namen = fouten.map(f => f.wat)
  const lijst = namen.length === 1 ? namen[0] : `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`
  const lokaal = fouten.filter(f => f.aantalLokaal > 0).map(f => `${f.aantalLokaal} ${f.wat}`)
  const leeg = fouten.filter(f => f.aantalLokaal === 0).map(f => f.wat)
  const delen = [`Niet van de server geladen: ${lijst}.`]
  if (lokaal.length) {
    delen.push(`Je ziet de laatst bewaarde kopie uit deze browser (${lokaal.join(', ')}); die kan verouderd zijn, en wat je nu wijzigt komt niet op de server tot dit is opgelost.`)
  }
  if (leeg.length) {
    delen.push(`Van ${leeg.join(' en ')} is ook geen kopie in deze browser — wat daar "niet gevonden" wordt, bestaat mogelijk wél.`)
  }
  return delen.join(' ')
}
