import { z } from 'zod'

/**
 * Wat voor werk een machine doet (2026-10-08). De planning laat een stap
 * alleen naar een machine van dezelfde soort slepen: een draaistap hoort niet
 * op de zaag. Leeg = nog niet ingevuld; zo'n machine telt nergens als
 * "zelfde soort", behalve voor zichzelf.
 */
export const MACHINE_SOORTEN = ['zagen', 'draaien', 'frezen', 'handwerk', 'uitbesteed'] as const
export type MachineSoort = typeof MACHINE_SOORTEN[number]
export const MACHINE_SOORT_LABEL: Record<MachineSoort, string> = {
  zagen: 'Zagen', draaien: 'Draaien', frezen: 'Frezen', handwerk: 'Handwerk', uitbesteed: 'Uitbesteed',
}

export const MachineSchema = z.object({
  id: z.string(),
  name: z.string(),
  machineRatePerHour: z.number(),
  operatorRatePerHour: z.number(),
  defaultSetupMin: z.number().int(),
  worksWeekends: z.boolean(),
  // Stangenlader en opspanning — zie de beslissing van 2026-09-11.
  barloaderMinMm: z.number().int().nonnegative().default(500),
  barloaderMaxMm: z.number().int().nonnegative().default(1100),
  opspanlengteMm: z.number().int().nonnegative().default(30),
  afsteekMm: z.number().int().nonnegative().default(3),
  /** Draaibank met stangenlader — dan telt de calculatie afsteek en opspanstukje mee. */
  heeftStangenlader: z.boolean().default(false),
  soort: z.enum(MACHINE_SOORTEN).nullable().default(null),
  createdAt: z.string(),
})
export type Machine = z.infer<typeof MachineSchema>

export const CreateMachineSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  machineRatePerHour: z.number().nonnegative(),
  operatorRatePerHour: z.number().nonnegative(),
  defaultSetupMin: z.number().int().nonnegative(),
  worksWeekends: z.boolean().default(false),
  barloaderMinMm: z.number().int().nonnegative().optional(),
  barloaderMaxMm: z.number().int().nonnegative().optional(),
  opspanlengteMm: z.number().int().nonnegative().optional(),
  afsteekMm: z.number().int().nonnegative().optional(),
  heeftStangenlader: z.boolean().optional(),
  soort: z.enum(MACHINE_SOORTEN).nullable().optional(),
})
export type CreateMachine = z.infer<typeof CreateMachineSchema>

export const UpdateMachineSchema = CreateMachineSchema.partial()
export type UpdateMachine = z.infer<typeof UpdateMachineSchema>
