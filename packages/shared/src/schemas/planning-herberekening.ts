import { z } from 'zod'

/**
 * Automatisch plannen (2026-10-08). Een herberekening legt van elke stap die
 * verandert de oude en de nieuwe planning vast, zodat hij in zijn geheel terug
 * kan. Het scherm rekent (alleen daar zijn de geschatte tijden bekend); de
 * server leest zelf de oude waarden en schrijft alles in één transactie.
 */
export const StapPlanWaardenSchema = z.object({
  geplandDatum: z.string().nullable(),
  geplandMachine: z.string().nullable(),
  queuePosition: z.number().nullable(),
  prioriteit: z.number().nullable(),
  /** Ontbreekt in herberekeningen van vóór 2026-10-09; dan blijft hij staan. */
  machineWacht: z.boolean().optional(),
})
export type StapPlanWaarden = z.infer<typeof StapPlanWaardenSchema>

export const HerberekeningWijzigingSchema = z.object({
  stapId: z.string(),
  projectId: z.string(),
  orderId: z.string(),
  oud: StapPlanWaardenSchema,
  nieuw: StapPlanWaardenSchema,
})
export type HerberekeningWijziging = z.infer<typeof HerberekeningWijzigingSchema>

export const HerberekenInvoerSchema = z.object({
  aanleiding: z.string().min(1).max(300),
  wijzigingen: z.array(StapPlanWaardenSchema.extend({ stapId: z.string() })).max(5000),
  /** Wat de melding toonde; alleen om later terug te lezen. */
  samenvatting: z.unknown().optional(),
})
export type HerberekenInvoer = z.infer<typeof HerberekenInvoerSchema>

export const HerberekeningSchema = z.object({
  id: z.string(),
  aanleiding: z.string(),
  door: z.string(),
  op: z.string(),
  wijzigingen: z.array(HerberekeningWijzigingSchema),
  samenvatting: z.unknown().nullable(),
  ongedaanOp: z.string().nullable(),
  ongedaanDoor: z.string().nullable(),
})
export type Herberekening = z.infer<typeof HerberekeningSchema>

/**
 * Wat ongedaan maken tegenhoudt. `gestart`/`gereed` komen van de werkvloer en
 * zijn met één klik te wissen; `gewijzigd` is een latere planningswijziging
 * met de hand, die gaat bij wissen gewoon terug naar de oude stand.
 */
export const BlokkadeSchema = z.object({
  soort: z.enum(['gestart', 'gereed', 'gewijzigd']),
  stapId: z.string(),
  projectId: z.string(),
  orderId: z.string(),
  tekst: z.string(),
  /** Bij `gestart`: hoeveel seconden er sindsdien gemeten zijn (gaan verloren bij wissen). */
  seconden: z.number().optional(),
})
export type Blokkade = z.infer<typeof BlokkadeSchema>

export const OngedaanInvoerSchema = z.object({
  /** Ook de blokkades wissen (de werkvloer-handelingen terugdraaien). */
  wis: z.boolean().default(false),
})
