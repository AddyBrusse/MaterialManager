import { z } from 'zod'

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
})
export type CreateMachine = z.infer<typeof CreateMachineSchema>

export const UpdateMachineSchema = CreateMachineSchema.partial()
export type UpdateMachine = z.infer<typeof UpdateMachineSchema>
