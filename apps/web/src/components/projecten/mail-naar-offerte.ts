import { articlesApi } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { projectsApi } from '../../api/projects'
import { bewerkingenVan, prijsVoor, type PrijsBronnen } from '../../utils/artikel-prijs'
import type { CandidateLine, Project } from '@stockmanager/shared'

/**
 * Herkende mailregels omzetten naar offerteregels — features/60-mail-import.md §3.6.
 *
 * Draait pas als iemand in het reviewscherm op "Overnemen" klikt. Wat hier
 * ontstaat is een concept-offerte: prijzen uit de calculatie, maar niets is
 * verstuurd en alles blijft aanpasbaar.
 */

export interface OvernameResultaat {
  offerteId: string
  aantalRegels: number
  /** Regels zonder gekoppeld artikel: wel overgenomen, maar zonder prijs. */
  zonderPrijs: number
}

function omschrijvingVan(line: CandidateLine): string {
  return [
    line.tekening ? `Tekening ${line.tekening}` : null,
    line.rev ? `rev ${line.rev}` : null,
    line.positie !== null ? `pos. ${line.positie}` : null,
    'uit mail',
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Zet de regels op de laatste offerte van het project, of maakt er een als die
 * er nog niet is.
 */
export function neemRegelsOver(project: Project, kandidaten: CandidateLine[]): OvernameResultaat {
  const bronnen: PrijsBronnen = {
    grades: gradesApi.listSync(),
    profiles: profilesApi.listSync(),
    machines: machinesApi.listSync(),
  }
  const articles = articlesApi.list()

  let werkProject = project
  let offerte = werkProject.offertes[werkProject.offertes.length - 1]
  if (!offerte) {
    werkProject = projectsApi.addOfferte(werkProject.id)
    offerte = werkProject.offertes[werkProject.offertes.length - 1]
  }

  let zonderPrijs = 0
  for (const line of kandidaten) {
    const qty = line.qty ?? 1
    const article = line.artikelId ? articles.find((a) => a.id === line.artikelId) ?? null : null

    if (!article) {
      // Geen artikel gekoppeld: tóch overnemen, want de klant vroeg er wél om.
      // Prijs 0 valt op in het totaal — dat is de bedoeling, het dwingt een
      // beslissing af in plaats van dat de regel stilletjes verdwijnt.
      zonderPrijs++
      projectsApi.addOfferteRegel(werkProject.id, offerte.id, {
        artikelId: null,
        naam: line.tekening ?? line.ruweTekst,
        omschrijving: `${omschrijvingVan(line)} — nog geen artikel gekoppeld`,
        qty,
        eenheid: 'st',
        verkoopprijs: 0,
        bewerkingen: [],
      })
      continue
    }

    // Prijs bij het gevraagde aantal, niet bij één: instelkosten gelden per
    // batch, dus 10 stuks is per stuk goedkoper dan 1.
    const { verkoopprijs } = prijsVoor(article, bronnen, qty)
    projectsApi.addOfferteRegel(werkProject.id, offerte.id, {
      artikelId: article.id,
      naam: article.naam,
      omschrijving: omschrijvingVan(line),
      qty,
      eenheid: 'st',
      verkoopprijs,
      bewerkingen: bewerkingenVan(article),
    })
  }

  return { offerteId: offerte.id, aantalRegels: kandidaten.length, zonderPrijs }
}
