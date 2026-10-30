// Welke tabellen en velden de AI-assistent mag lezen (2026-10-28).
//
// De velden komen uit het Prisma-schema zelf (DMMF), zodat een nieuwe kolom
// vanzelf leesbaar is en de lijst niet uit de pas loopt met de database. Wat
// níet mee mag staat hier met naam: hele tabellen (techniek, instellingen) en
// velden die niet naar Anthropic gaan (afgesproken met Addy 2026-10-28: IBAN,
// KvK en btw van relaties, mailinhoud, schermafbeeldingen, e-mail en telefoon
// van gebruikers). Een nieuwe gevoelige kolom moet hier dus bij VERBORGEN.
import { Prisma } from '@prisma/client'

export type Soort = 'tekst' | 'keuze' | 'getal' | 'ja/nee' | 'tijdstip' | 'dag' | 'tijdstip-tekst' | 'lijst' | 'json'

export interface Veld {
  naam: string
  soort: Soort
  nullable: boolean
  /** Bij een Prisma-enum: de toegestane waarden. */
  waarden?: string[]
  /** Alleen filteren op leeg / niet leeg; de inhoud gaat niet mee (te groot). */
  alleenFilter?: boolean
  uitleg?: string
}

export interface Tabel {
  naam: string
  model: string
  uitleg: string
  velden: Map<string, Veld>
  /** Route in de app voor een rij, als die er is. */
  link?: (r: Record<string, unknown>) => string | null
}

const naarProject = (r: Record<string, unknown>) => (r.projectId ? `/projecten/${r.projectId}` : null)

const TABELLEN_DEF: { naam: string; model: string; uitleg: string; link?: Tabel['link'] }[] = [
  { naam: 'projecten', model: 'Project', link: (r) => `/projecten/${r.id}`,
    uitleg: 'Klantprojecten (PRJ-…). status: concept (nog geen offerte verstuurd), offerte (offerte verstuurd), bevestigd (geaccepteerd), productie, paklijst (alles gemaakt), verzonden (alles geleverd), gefactureerd, on_hold, geannuleerd. relatieId = de klant.' },
  { naam: 'offertes', model: 'Offerte', link: naarProject,
    uitleg: 'Offerteversies (OFF-…) bij een project. status: concept (nog niet verstuurd), verzonden (wacht op de klant), geaccepteerd, vervallen. direct = opdracht zonder offerte.' },
  { naam: 'offerteRegels', model: 'OfferteRegel', uitleg: 'Regels van een offerte: artikel, aantal, verkoopprijs per stuk, totaal.' },
  { naam: 'opdrachtbevestigingen', model: 'Opdrachtbevestiging', link: naarProject, uitleg: 'Opdrachtbevestiging (OB-…) per project. status: concept of verzonden.' },
  { naam: 'opdrachtRegels', model: 'ObRegel', uitleg: 'Regels van een opdrachtbevestiging.' },
  { naam: 'productieOrders', model: 'ProductieOrder', link: naarProject,
    uitleg: 'Productieorders per offerteregel. status: voorbereiding (geaccepteerd, nog niet in productie gegeven), gepland, in_productie, gereed, gestopt. aantalGereed = stuks klaar.' },
  { naam: 'productieStappen', model: 'ProductieStap', uitleg: 'Bewerkingen van een order op een machine, in volgorde. gereedOp gevuld = gereedgemeld. geplandDatum/geplandMachine = planning.' },
  { naam: 'tijdregistraties', model: 'TijdRegistratie', link: () => '/tijdregistratie',
    uitleg: 'Klokregels per stap: soort instellen of draaien, bemand ja/nee, status lopend/gepauzeerd/afgerond, userNaam = wie. Werkelijke tijd = bijgesteldeSeconden als die gevuld is, anders gemetenSeconden (plus de lopende tijd sinds lopendSinds).' },
  { naam: 'pakbonnen', model: 'Paklijst', link: naarProject, uitleg: 'Pakbonnen (PL-…). verzondenOp leeg = nog niet verstuurd.' },
  { naam: 'pakbonRegels', model: 'PaklijstRegel', uitleg: 'Regels van een pakbon: welke order, hoeveel stuks.' },
  { naam: 'facturen', model: 'Factuur', link: naarProject,
    uitleg: 'Facturen en credits (FACT-/CRED-…), soort factuur of credit. verzondenOp leeg = concept. betaaldOp gevuld = betaald. Bedragen in euro; subtotaal excl. btw.' },
  { naam: 'factuurRegels', model: 'FactuurRegel', uitleg: 'Regels van een factuur.' },
  { naam: 'relaties', model: 'Relatie', link: (r) => `/relaties/${r.id}`, uitleg: 'Klanten en leveranciers (type). contacten = contactpersonen.' },
  { naam: 'artikelen', model: 'Article', link: (r) => `/artikelen/${encodeURIComponent(String(r.id))}`,
    uitleg: 'Artikelen (wat we maken) met tekening en revisie. De calculatie zelf (estimate) is niet leesbaar; "estimate leeg" = nog geen calculatie. Een artikel zonder recept staat als melding "Artikel zonder recept".' },
  { naam: 'prijshistorie', model: 'ArtikelPrijsSnapshot', uitleg: 'Kostprijs en verkoopprijs van een artikel door de tijd: bron order (geaccepteerde offerte) of calculatie (recept gewijzigd).' },
  { naam: 'artikelAliassen', model: 'ArticleAlias', uitleg: 'Artikelnummer van een klant gekoppeld aan ons artikel.' },
  { naam: 'todos', model: 'Todo', link: () => '/todos',
    uitleg: "Todo's. done = afgerond, dueDate = deadline, priority low/normal/high, soort: leeg (met de hand), materiaal_selecteren, bestellen, recept_maken, verbeterpunt (knop \"Dit klopt niet\"). claimedByUserId = opgepakt door, createdByUserId = gemaakt door (zie gebruikers)." },
  { naam: 'mailImports', model: 'MailImport',
    uitleg: 'Ingelezen mails: afzender, onderwerp, klantRef. status: nieuw (nog niet gekoppeld), verwerkt (gekoppeld aan projectId), genegeerd, fout. De inhoud van de mail is niet beschikbaar.' },
  { naam: 'voorraad', model: 'RawMaterial', link: () => '/voorraad',
    uitleg: 'Materiaal op voorraad: staven en exoten (exoot = voor één klant). currentStock = lengte op voorraad in mm, lengthMm = oorspronkelijke lengte. gradeId/profileId: zie kwaliteiten/profielen. Wat gereserveerd is staat in zaagReserveringen.' },
  { naam: 'voorraadMutaties', model: 'StockMovement', uitleg: 'Mutaties van de voorraad: itemId = voorraad.id, reason received/used/scrapped/correction/other, amount, previousStock, newStock, userId = wie.' },
  { naam: 'kwaliteiten', model: 'Grade', uitleg: 'Materiaalkwaliteiten (bijv. C45) met dichtheid en prijs per kg.' },
  { naam: 'profielen', model: 'Profile', uitleg: 'Profielvormen (rond, plat, buis, …).' },
  { naam: 'afwerkingen', model: 'SurfaceFinish', uitleg: 'Afwerkingen van materiaal.' },
  { naam: 'locaties', model: 'Location', uitleg: 'Rekken en kasten.' },
  { naam: 'locatieVakken', model: 'LocationSlot', uitleg: 'Vakken in een rek of kast.' },
  { naam: 'machines', model: 'Machine', uitleg: 'Machines met uurtarief, soort (zagen/draaien/frezen/handwerk/uitbesteed) en stangenlader.' },
  { naam: 'gebruikers', model: 'User', uitleg: 'Gebruikers: name, role admin/user/terminal (terminal = machinescherm, geen persoon).' },
  { naam: 'bestelRegels', model: 'BestelRegel', link: (r) => `/bestellingen?regel=${r.id}`,
    uitleg: 'Wat er besteld moet worden of is, als maat (stuks × lengteMm). status: te_bestellen, aangevraagd (prijsaanvraag), buffer (leverancier gekozen, nog bundelen), besteld, ontvangen. bron: waar de regel vandaan komt.' },
  { naam: 'prijsaanvragen', model: 'Prijsaanvraag', link: () => '/bestellingen?tab=aanvragen', uitleg: 'Prijsaanvragen (PA-…) aan leveranciers.' },
  { naam: 'prijsaanvraagRegels', model: 'PrijsaanvraagRegel', uitleg: 'Welke bestelregels in een prijsaanvraag zitten.' },
  { naam: 'prijsaanvraagLeveranciers', model: 'PrijsaanvraagLeverancier', uitleg: 'Aan welke leverancier een prijsaanvraag ging, en wanneer.' },
  { naam: 'prijsaanvraagAntwoorden', model: 'PrijsaanvraagAntwoord', uitleg: 'Prijzen die een leverancier opgaf per bestelregel.' },
  { naam: 'inkooporders', model: 'Inkooporder', link: () => '/bestellingen', uitleg: 'Inkooporders (INK-…) per leverancier. status: concept, verzonden, vervallen.' },
  { naam: 'inkooporderRegels', model: 'InkooporderRegel', uitleg: 'Regels van een inkooporder: stuks, lengte, totaal, verwachtDatum, ontvangenStuks, materiaalNummer.' },
  { naam: 'ontvangsten', model: 'Ontvangst', uitleg: 'Materiaal dat binnen geboekt is, per inkooporderregel.' },
  { naam: 'leverancierPrijzen', model: 'LeverancierPrijs', uitleg: 'Prijzen per leverancier, per materiaal of per kwaliteit, per kg of per stuk.' },
  { naam: 'zaagReserveringen', model: 'ZaagReservering', link: () => '/reserveringen', uitleg: 'Materiaal dat voor een order vastligt (barCode = de staaf). status open = nog niet gezaagd.' },
  { naam: 'planningHerberekeningen', model: 'PlanningHerberekening', uitleg: 'Elke keer dat de planning automatisch herrekend is: aanleiding, door, op, ongedaan gemaakt.' },
  { naam: 'inkoopBijlagen', model: 'InkoopBijlage', uitleg: 'Bijlagen bij de inkoop (offerte of orderbevestiging van de leverancier).' },
  { naam: 'nummeringLogboek', model: 'DocReeksWijziging', uitleg: 'Wie het volgende documentnummer met de hand veranderde, en waarom.' },
]

/** Velden die nooit meegaan. */
const VERBORGEN: Record<string, string[]> = {
  Relatie: ['iban', 'kvk', 'btw'],
  User: ['email', 'telefoon', 'avatarPath'],
  MailImport: ['bodyText', 'bodyHtmlPath', 'bijlagen', 'kandidaten', 'extractie', 'resolutie', 'dedupeKey', 'messageId'],
  Todo: ['schermafbeelding', 'context', 'calendarEventId'],
  Article: ['drawingPath', 'photoPath', 'attachments'],
  RawMaterial: ['photoPath'],
  InkoopBijlage: ['pad'],
}

/** Grote JSON: alleen filteren op leeg / niet leeg. */
const ALLEEN_FILTER: Record<string, string[]> = {
  Article: ['recipe', 'estimate', 'operations'],
  ZaagReservering: ['stangen'],
  PlanningHerberekening: ['wijzigingen', 'samenvatting'],
  Opdrachtbevestiging: ['verzendingen', 'wijzigingen'],
  Profile: ['dimensionSchema'],
}

/** Datums die als tekst opgeslagen zijn: een kale dag, of een tijdstip in ISO. */
const DAG: Record<string, string[]> = {
  Project: ['levertijdDatum'], Offerte: ['geldigTot'], Opdrachtbevestiging: ['levertijdDatum'],
  ProductieStap: ['geplandDatum'], Factuur: ['vervaldatum'], InkooporderRegel: ['verwachtDatum'],
}
const TIJDSTIP_TEKST: Record<string, string[]> = {
  Offerte: ['verzondenOp', 'geaccepteerdOp'], Opdrachtbevestiging: ['verzondenOp'], ProductieStap: ['gereedOp'],
  Paklijst: ['verzondenOp'], Factuur: ['verzondenOp', 'betaaldOp'],
}

function soortVan(model: string, f: Prisma.DMMF.Field): Soort {
  if (DAG[model]?.includes(f.name)) return 'dag'
  if (TIJDSTIP_TEKST[model]?.includes(f.name)) return 'tijdstip-tekst'
  if (f.kind === 'enum') return 'keuze'
  if (f.isList) return 'lijst'
  switch (f.type) {
    case 'Int': case 'Float': case 'Decimal': case 'BigInt': return 'getal'
    case 'Boolean': return 'ja/nee'
    case 'DateTime': return 'tijdstip'
    case 'Json': return 'json'
    default: return 'tekst'
  }
}

/** De eerste zin van een `///`-opmerking in het schema, kort. */
function korteUitleg(doc: string | undefined): string | undefined {
  if (!doc) return undefined
  const zin = doc.replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0]
  return zin.length > 90 ? `${zin.slice(0, 88)}…` : zin
}

function bouw(): Map<string, Tabel> {
  const modellen = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]))
  const enums = new Map(Prisma.dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]))
  const uit = new Map<string, Tabel>()
  for (const d of TABELLEN_DEF) {
    const m = modellen.get(d.model)
    if (!m) throw new Error(`Assistent-catalogus: model ${d.model} bestaat niet meer`)
    const velden = new Map<string, Veld>()
    for (const f of m.fields) {
      if (f.kind === 'object' || VERBORGEN[d.model]?.includes(f.name)) continue
      velden.set(f.name, {
        naam: f.name, soort: soortVan(d.model, f), nullable: !f.isRequired,
        waarden: f.kind === 'enum' ? enums.get(f.type) : undefined,
        alleenFilter: ALLEEN_FILTER[d.model]?.includes(f.name) || undefined,
        uitleg: korteUitleg(f.documentation),
      })
    }
    uit.set(d.naam, { naam: d.naam, model: d.model, uitleg: d.uitleg, velden, link: d.link })
  }
  return uit
}

export const TABELLEN = bouw()

/** De catalogus als tekst voor het taalmodel. Vast en in vaste volgorde, zodat hij in de cache blijft. */
export function catalogusTekst(): string {
  const regels: string[] = []
  for (const t of TABELLEN.values()) {
    const velden = [...t.velden.values()].map((v) => {
      const extra = [
        v.soort === 'tekst' ? null : v.soort === 'keuze' ? v.waarden?.join('/') : v.soort,
        v.alleenFilter ? 'alleen leeg/niet_leeg' : null,
      ].filter(Boolean).join(', ')
      return `${v.naam}${v.nullable ? '?' : ''}${extra ? ` (${extra})` : ''}${v.uitleg ? ` — ${v.uitleg}` : ''}`
    })
    regels.push(`## ${t.naam}\n${t.uitleg}\nVelden: ${velden.join('; ')}`)
  }
  return regels.join('\n\n')
}
