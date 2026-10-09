import { z } from 'zod'

// ── Status enums ──────────────────────────────────────────────────────────────

export const PROJECT_STATUSES = [
  'concept', 'offerte', 'bevestigd', 'productie',
  'paklijst', 'verzonden', 'gefactureerd', 'on_hold', 'geannuleerd',
] as const
export type ProjectStatus = typeof PROJECT_STATUSES[number]

export const OFFERTE_STATUSES = ['concept', 'verzonden', 'geaccepteerd', 'vervallen'] as const
export type OfferteStatus = typeof OFFERTE_STATUSES[number]

// `voorbereiding`: geaccepteerd, maar nog niet vrijgegeven voor de hal
// (besloten 2026-09-30, zie calc/vrijgeven.ts). Niet in wachtrij, planning of
// terminal.
// `gestopt`: de regel is uit de opdracht gehaald terwijl er al aan gewerkt
// was (besloten 2026-09-28). De order blijft zichtbaar met wat er gemaakt is,
// maar staat niet meer in de wachtrij van de werkvloer.
export const PRODUCTIE_ORDER_STATUSES = ['voorbereiding', 'gepland', 'in_productie', 'gereed', 'gestopt'] as const
export type ProductieOrderStatus = typeof PRODUCTIE_ORDER_STATUSES[number]

// ── Productie stap ────────────────────────────────────────────────────────────

export const ProductieStapSchema = z.object({
  id: z.string(),
  volgorde: z.number().int(),
  naam: z.string(),
  machine: z.string().nullable(),
  gereedOp: z.string().nullable(),    // ISO datetime
  gereedDoor: z.string().nullable(),  // user name
  geplandDatum: z.string().nullable().optional(),   // 'YYYY-MM-DD'
  geplandMachine: z.string().nullable().optional(), // machine name override
  // Wachtrij (priority-queue planning) — see features/design_handoff_planning_page.
  // Float position for O(1) reordering (fractional indexing: inserting between
  // two neighbors only ever touches this one step's own value, never siblings'),
  // which matters because a machine's queue can span steps that live in many
  // different Project rows. null = not queued (backlog).
  queuePosition: z.number().nullable().optional(),
  // Automatisch plannen (2026-10-08): de rang die de planner gaf, lager = eerder.
  // Los van queuePosition: dat is de volgorde die er op de machine uitkomt, en
  // een stap die op zijn vorige stap wacht kan daar later staan dan zijn
  // prioriteit zegt. null = nog nooit ingepland; die komt in op uiterlijk starten.
  prioriteit: z.number().nullable().optional(),
  // "Machine laten wachten" (2026-10-09): de planning vult de tijd vóór deze
  // stap op zijn machine niet met ander werk. Geldt tot de stap gestart is.
  machineWacht: z.boolean().optional(),
})
export type ProductieStap = z.infer<typeof ProductieStapSchema>

// ── Productie order ───────────────────────────────────────────────────────────

export const ProductieOrderSchema = z.object({
  id: z.string(),              // PROD-YYYY-NNN
  projectId: z.string(),
  offerteRegelId: z.string(),
  artikelId: z.string().nullable(),
  artikelNaam: z.string(),
  qty: z.number(),
  eenheid: z.string(),
  // Hoeveel stuks er werkelijk klaar zijn. Een order was eerder óf gereed óf
  // niet, en dan is "34 van de 40" niet vast te houden — terwijl dat precies
  // het getal is waar een deellevering op wacht. De operator vult het in bij
  // het gereedmelden; afleiden uit de tijdregistratie zou 0 opleveren zodra
  // iemand vergeet te klokken, en dan lijkt een volle kist leeg.
  aantalGereed: z.number().default(0),
  stappen: z.array(ProductieStapSchema),
  status: z.enum(PRODUCTIE_ORDER_STATUSES),
  // Afgeleid bij het lezen, nooit opgeslagen (2026-10-07): er staat voor deze
  // orderregel nog materiaal in bestelling. Gaat vanzelf uit als alles binnen
  // geboekt is. Zo'n order staat niet op de terminal; de planning ziet hem wel.
  wachtOpMateriaal: z.boolean().optional(),
  // Afgeleid (2026-10-09): wanneer het materiaal er naar verwachting is, voor
  // de planning. Besteld: verstuurd + levertijd of de doorgegeven leverdatum.
  // Nog niet besteld: vandaag + levertijd van de gekozen leverancier. Is van
  // een open bestelling geen datum te zeggen, dan `materiaalOnbekend`.
  materiaalVerwacht: z.string().nullable().optional(),
  materiaalOnbekend: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ProductieOrder = z.infer<typeof ProductieOrderSchema>

// ── Offerte regel (frozen snapshot) ──────────────────────────────────────────

export const OfferteRegelSchema = z.object({
  id: z.string(),
  sortOrder: z.number().int(),
  artikelId: z.string().nullable(),
  naam: z.string(),
  omschrijving: z.string(),
  qty: z.number(),
  eenheid: z.string(),
  verkoopprijs: z.number(),  // selling price per unit (not internal kostprijs)
  totaal: z.number(),        // qty * verkoopprijs
  bewerkingen: z.array(z.string()),  // frozen operation names for productie steps
})
export type OfferteRegel = z.infer<typeof OfferteRegelSchema>

// ── Offerte ───────────────────────────────────────────────────────────────────

export const OfferteSchema = z.object({
  id: z.string(),              // OFF-YYYY-NNN (sleutel, uniek per versie)
  // Het nummer dat de klant ziet. Versies van dezelfde offerte delen dit: een
  // nieuwe versie vervángt de vorige, dus hij hoort hetzelfde nummer te dragen.
  // Het id kan dat niet zijn — dat is de primary key en moet per versie
  // verschillen. Bestaande offertes dragen hier hun eigen id, want die
  // nummers liggen mogelijk al bij een klant; alleen versies die na deze
  // wijziging bijkomen erven het nummer van v1.
  documentNr: z.string(),
  projectId: z.string(),
  versie: z.number().int(),
  status: z.enum(OFFERTE_STATUSES),
  regels: z.array(OfferteRegelSchema),
  notities: z.string(),
  // Waar deze versie antwoord op geeft: een RFQ-nummer van de klant, of "mail
  // J. Prins 12-09". Per versie en niet per project, want een herziening
  // beantwoordt vaak een nieuwe vraag; staffels op dezelfde RFQ delen hem.
  // Vrije tekst: klanten nummeren hun aanvragen op hun eigen manier, en een
  // mail heeft geen nummer.
  externeRef: z.string().nullable().default(null),
  /**
   * Een directe opdracht: er is geen offerte verstuurd, de klant gaf meteen
   * opdracht. Onder water gewoon een offerteversie, zodat productie,
   * nacalculatie, pakbon en factuur werken zoals altijd (besloten 2026-09-28).
   */
  direct: z.boolean().default(false),
  /**
   * Waarom een versie vervallen is. Terugdraaien naar de offertefase zet alleen
   * versies terug die door het accepteren vervielen — niet wat iemand bewust
   * introk. Leeg bij versies van vóór 2026-09-28.
   */
  vervallenDoor: z.enum(['acceptatie', 'intrekken']).nullable().default(null),
  geldigTot: z.string().nullable(),
  verzondenOp: z.string().nullable(),
  geaccepteerdOp: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Offerte = z.infer<typeof OfferteSchema>

// ── Paklijst ──────────────────────────────────────────────────────────────────

export const PaklijstRegelSchema = z.object({
  productieOrderId: z.string(),
  // Bij welke orderregel dit hoort. Af te leiden via de productieorder, maar
  // dan verdwijnt het geleverde aantal zodra die order weg is — en een
  // verstuurde pakbon is een document, dat hoort niet van gedachten te
  // veranderen. Vandaar hier vastgelegd.
  offerteRegelId: z.string().nullable(),
  artikelNaam: z.string(),
  qty: z.number(),
  eenheid: z.string(),
})
export type PaklijstRegel = z.infer<typeof PaklijstRegelSchema>

export const PaklijstSchema = z.object({
  id: z.string(),              // PL-YYYY-NNN
  projectId: z.string(),
  regels: z.array(PaklijstRegelSchema),
  notities: z.string(),
  verzondenOp: z.string().nullable(),
  createdAt: z.string(),
})
export type Paklijst = z.infer<typeof PaklijstSchema>

// ── Factuur ───────────────────────────────────────────────────────────────────

export const FactuurRegelSchema = z.object({
  offerteRegelId: z.string(),
  naam: z.string(),
  qty: z.number(),
  eenheid: z.string(),
  verkoopprijs: z.number(),
  totaal: z.number(),
})
export type FactuurRegel = z.infer<typeof FactuurRegelSchema>

export const FACTUUR_SOORTEN = ['factuur', 'credit'] as const
export type FactuurSoort = typeof FACTUUR_SOORTEN[number]

export const FactuurSchema = z.object({
  id: z.string(),              // FACT-YYYY-NNN of CRED-YYYY-NNN
  // Een credit is geen negatieve factuur maar een eigen document: hij laat de
  // factuur die hij crediteert staan (die is verstuurd en kan niet meer weg)
  // en telt er als tegenboeking naast. Daarom een soort en een verwijzing,
  // geen min-teken op de regels.
  soort: z.enum(FACTUUR_SOORTEN).default('factuur'),
  crediteertFactuurId: z.string().nullable().default(null),
  projectId: z.string(),
  offerteId: z.string(),
  regels: z.array(FactuurRegelSchema),
  btwPct: z.number(),
  subtotaal: z.number(),
  btwBedrag: z.number(),
  totaalInclBtw: z.number(),
  notities: z.string(),
  vervaldatum: z.string().nullable(),
  verzondenOp: z.string().nullable(),
  /**
   * Aan wie hij gaat, vastgelegd op de factuur zelf (2026-10-03). Facturen gaan
   * vaak naar administratie@… en niet naar de contactpersoon van de order; een
   * later gewijzigd adres bij de klant verandert een verstuurde factuur niet.
   */
  naarEmail: z.string().nullable().default(null),
  /** Wanneer hij betaald is; null = nog open. Alleen bij een factuur, niet bij een credit. */
  betaaldOp: z.string().nullable().default(null),
  createdAt: z.string(),
})
export type Factuur = z.infer<typeof FactuurSchema>

// ── Opdrachtbevestiging ───────────────────────────────────────────────────────

export const OB_STATUSES = ['concept', 'verzonden'] as const
export type OBStatus = typeof OB_STATUSES[number]

/**
 * Wat de klant kreeg bij één verzending. Bewaard zodat de kaart kan zeggen wat
 * er sindsdien veranderd is ("klant heeft nog levertijd 06-10") — de opdracht
 * zelf is na versturen nog steeds aan te passen.
 */
export const ObInhoudSchema = z.object({
  levertijd: z.string().nullable(),
  opdrachtRef: z.string().nullable(),
  notities: z.string(),
  regels: z.array(z.object({
    id: z.string(),
    naam: z.string(),
    qty: z.number(),
    verkoopprijs: z.number(),
  })),
})
export type ObInhoud = z.infer<typeof ObInhoudSchema>

export const ObVerzendingSchema = z.object({
  op: z.string(),
  /** Naam van wie hem verstuurde. */
  door: z.string(),
  /** Het adres waar de mail naartoe klaargezet werd, als dat bekend was. */
  naar: z.string().nullable(),
  inhoud: ObInhoudSchema,
})
export type ObVerzending = z.infer<typeof ObVerzendingSchema>

export const ObWijzigingSchema = z.object({
  op: z.string(),
  door: z.string(),
  tekst: z.string(),
})
export type ObWijziging = z.infer<typeof ObWijzigingSchema>

export const OpdrachtbevestigingSchema = z.object({
  id: z.string(),              // OB-YYYY-NNN
  projectId: z.string(),
  offerteId: z.string(),
  regels: z.array(OfferteRegelSchema),   // frozen snapshot from accepted offerte
  /**
   * Gelijk aan de levertijd van het project — sinds 2026-09-28 is er één
   * levertijd. De server vult dit bij lezen uit het project, zodat pdf en
   * scherm nooit een andere datum tonen dan de kop van de pagina.
   */
  levertijdDatum: z.string().nullable(),
  /** Komt als "Opmerking" op de pdf voor de klant. */
  notities: z.string(),
  /**
   * Waarmee de klant opdracht gaf: inkoopnummer, of "WhatsApp J. Prins 12-09".
   * Verplicht bij versturen.
   */
  opdrachtRef: z.string().nullable().default(null),
  status: z.enum(OB_STATUSES),
  /** De eerste keer verstuurd. Latere keren staan in `verzendingen`. */
  verzondenOp: z.string().nullable(),
  verzendingen: z.array(ObVerzendingSchema).default([]),
  /** Wat er na het accepteren aan de opdracht veranderd is, in gewone zinnen. */
  wijzigingen: z.array(ObWijzigingSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Opdrachtbevestiging = z.infer<typeof OpdrachtbevestigingSchema>

// ── Project (root document) ───────────────────────────────────────────────────

export const ProjectSchema = z.object({
  id: z.string(),              // PRJ-YYYY-NNN
  naam: z.string(),
  relatieId: z.string().nullable(),
  contactId: z.string().nullable(),
  klantRef: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  // Alleen gevuld bij on_hold en geannuleerd: waarom het project stilligt, en
  // naar welke status hervatten terugkeert.
  statusReden: z.string().nullable(),
  statusVorige: z.enum(PROJECT_STATUSES).nullable(),
  levertijdDatum: z.string().nullable(),
  notities: z.string(),
  offertes: z.array(OfferteSchema),
  opdrachtbevestiging: OpdrachtbevestigingSchema.nullable(),
  productieOrders: z.array(ProductieOrderSchema),
  // Meervoud, want deelleveringen zijn de regel en niet de uitzondering: één
  // order gaat in twee of drie kisten de deur uit. Elke pakbon krijgt een
  // eigen nummer en laat niets vervallen — anders dan een offerteversie.
  paklijsten: z.array(PaklijstSchema),
  facturen: z.array(FactuurSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Project = z.infer<typeof ProjectSchema>

// Reden bij het on hold zetten of annuleren. Verplicht: een project dat
// stilligt zonder uitleg levert over een maand alleen maar vragen op.
export const ProjectStatusStopSchema = z.object({
  status: z.enum(['on_hold', 'geannuleerd']),
  reden: z.string().min(1, 'Reden is verplicht'),
})
export type ProjectStatusStop = z.infer<typeof ProjectStatusStopSchema>

export const CreateProjectSchema = z.object({
  naam: z.string().min(1, 'Naam is verplicht'),
  relatieId: z.string().nullable(),
  contactId: z.string().nullable(),
  klantRef: z.string().nullable(),
  levertijdDatum: z.string().nullable(),
  notities: z.string(),
})
export type CreateProject = z.infer<typeof CreateProjectSchema>

export const UpdateProjectSchema = CreateProjectSchema.partial().extend({
  status: z.enum(PROJECT_STATUSES).optional(),
})
export type UpdateProject = z.infer<typeof UpdateProjectSchema>
