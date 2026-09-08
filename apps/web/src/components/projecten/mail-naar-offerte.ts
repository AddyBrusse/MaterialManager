import { articlesApi, type Article, type ArticleAttachment } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { projectsApi } from '../../api/projects'
import { mailImportsApi } from '../../api/mail-imports'
import { bewerkingenVan, prijsVoor, type PrijsBronnen } from '../../utils/artikel-prijs'
import type { CandidateLine, MailImport, Project } from '@stockmanager/shared'

/**
 * Herkende mailregels omzetten naar offerteregels — features/60-mail-import.md §3.6.
 *
 * Draait pas als iemand in het reviewscherm op "Overnemen" klikt. Wat hier
 * ontstaat is een concept-offerte: prijzen uit de calculatie, maar niets is
 * verstuurd en alles blijft aanpasbaar.
 *
 * Ook bij een opdrachtbevestiging gaat het eerst naar een offerte. Eén route is
 * minder verrassend dan twee, en de prijzen zijn sowieso te controleren voordat
 * er iets de deur uit gaat.
 */

export interface OvernameResultaat {
  offerteId: string
  aantalRegels: number
  /** Regels zonder gekoppeld artikel: wel overgenomen, maar zonder prijs. */
  zonderPrijs: number
  /** Artikelen die hier zijn ontstaan omdat de klant iets nieuws vroeg. */
  nieuweArtikelen: string[]
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
 * Een artikel maken voor iets wat we nog niet kenden.
 *
 * De klant vraagt om een onderdeel dat niet in de database staat, maar stuurt er
 * wel een tekening bij mee. Zonder dit blijft die tekening in de mailmap liggen
 * en begint de volgende aanvraag van dezelfde klant weer bij nul. Het artikel is
 * bewust léég op de calculatie na: naam, tekeningnummer, revisie en de
 * bestanden. Een prijs verzinnen we niet — die offerteregel staat op € 0 tot
 * iemand de calculatie invult, en dat valt op in het totaal.
 */
async function maakArtikelVoor(
  line: CandidateLine,
  mailImport: MailImport,
  klantNaam: string | null
): Promise<Article> {
  const naam = line.tekening ?? line.ruweTekst.slice(0, 60)
  const artikel = articlesApi.create({
    naam,
    klant: klantNaam,
    relatieId: mailImport.relatieId,
    contactId: null,
    tekening: line.tekening,
    rev: line.rev,
    drawingPath: null,
    photoPath: null,
    recipe: null,
    operations: [],
    notes: { workholding: '', general: `Aangemaakt uit mail "${mailImport.onderwerp}".` },
    attachments: [],
    estimate: null,
    locatie: null,
    currentStock: 0,
    minStock: null,
    maxStock: null,
  })

  if (line.bestanden.length > 0) {
    // Kopiëren gebeurt op de server; de bytes gaan niet door de browser heen.
    const gekopieerd = await mailImportsApi.copyFilesToArticle(mailImport.id, artikel.id, line.bestanden)
    const attachments: ArticleAttachment[] = gekopieerd.map((f, i) => ({
      id: `att_${artikel.id}_${i}_${Date.now()}`,
      kind: f.kind as ArticleAttachment['kind'],
      name: f.name,
      sizeBytes: f.sizeBytes,
      machine: null,
      note: `Uit mail van ${mailImport.afzenderEmail ?? 'klant'}`,
      path: f.path,
      uploadedAt: new Date().toISOString(),
    }))
    await articlesApi.update(artikel.id, { attachments })
    return { ...artikel, attachments }
  }
  return artikel
}

export interface OvernameInput {
  project: Project
  mailImport: MailImport
  klantNaam: string | null
}

/**
 * Zet de regels op de laatste offerte van het project, of maakt er een als die
 * er nog niet is. Neemt ook de gegevens over die om de regels heen staan: het
 * ordernummer van de klant en de gevraagde leverdatum.
 */
export async function neemRegelsOver({
  project,
  mailImport,
  klantNaam,
}: OvernameInput): Promise<OvernameResultaat> {
  const bronnen: PrijsBronnen = {
    grades: gradesApi.listSync(),
    profiles: profilesApi.listSync(),
    machines: machinesApi.listSync(),
  }

  // De projectvelden (klantreferentie, leverdatum) worden hier bewust *niet*
  // geschreven. De projectpagina houdt die in eigen state en persisteert ze met
  // een debounce; een update vanaf hier werd daar 400 ms later overheen
  // geschreven en verdween zonder spoor. Wie het veld bezit, schrijft het —
  // de pagina vult ze in via onLinked.
  let werkProject = project
  let offerte = werkProject.offertes[werkProject.offertes.length - 1]
  if (!offerte) {
    werkProject = projectsApi.addOfferte(werkProject.id)
    offerte = werkProject.offertes[werkProject.offertes.length - 1]
  }

  let zonderPrijs = 0
  const nieuweArtikelen: string[] = []

  for (const line of mailImport.kandidaten) {
    const qty = line.qty ?? 1
    let article = line.artikelId ? articlesApi.get(line.artikelId) : null

    if (!article) {
      // Niets gevonden: aanmaken, mét de tekeningen die de klant meestuurde.
      article = await maakArtikelVoor(line, mailImport, klantNaam)
      nieuweArtikelen.push(article.id)
    }

    // Prijs bij het gevraagde aantal, niet bij één: instelkosten gelden per
    // batch, dus 10 stuks is per stuk goedkoper dan 1. Een vers artikel heeft
    // nog geen calculatie en komt dus op € 0 — dat hoort op te vallen.
    const { verkoopprijs } = prijsVoor(article, bronnen, qty)
    if (verkoopprijs === 0) zonderPrijs++

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

  return {
    offerteId: offerte.id,
    aantalRegels: mailImport.kandidaten.length,
    zonderPrijs,
    nieuweArtikelen,
  }
}
