import { z } from 'zod'

// ── Status enums ──────────────────────────────────────────────────────────────

export const PROJECT_STATUSES = [
  'concept', 'offerte', 'bevestigd', 'productie',
  'paklijst', 'verzonden', 'gefactureerd', 'on_hold', 'geannuleerd',
] as const
export type ProjectStatus = typeof PROJECT_STATUSES[number]

export const OFFERTE_STATUSES = ['concept', 'verzonden', 'geaccepteerd', 'vervallen'] as const
export type OfferteStatus = typeof OFFERTE_STATUSES[number]

export const PRODUCTIE_ORDER_STATUSES = ['gepland', 'in_productie', 'gereed'] as const
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
  stappen: z.array(ProductieStapSchema),
  status: z.enum(PRODUCTIE_ORDER_STATUSES),
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
  id: z.string(),              // OFF-YYYY-NNN
  projectId: z.string(),
  versie: z.number().int(),
  status: z.enum(OFFERTE_STATUSES),
  regels: z.array(OfferteRegelSchema),
  notities: z.string(),
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

export const FactuurSchema = z.object({
  id: z.string(),              // FACT-YYYY-NNN
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
  createdAt: z.string(),
})
export type Factuur = z.infer<typeof FactuurSchema>

// ── Project (root document) ───────────────────────────────────────────────────

export const ProjectSchema = z.object({
  id: z.string(),              // PRJ-YYYY-NNN
  naam: z.string(),
  relatieId: z.string().nullable(),
  contactId: z.string().nullable(),
  klantRef: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  levertijdDatum: z.string().nullable(),
  notities: z.string(),
  offertes: z.array(OfferteSchema),
  productieOrders: z.array(ProductieOrderSchema),
  paklijst: PaklijstSchema.nullable(),
  factuur: FactuurSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Project = z.infer<typeof ProjectSchema>

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
