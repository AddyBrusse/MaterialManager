import { z } from 'zod'

export const MachineSchema = z.object({
  id: z.string(),
  name: z.string(),
  machineRatePerHour: z.number(),
  operatorRatePerHour: z.number(),
  defaultSetupMin: z.number().int(),
  createdAt: z.string(),
})
export type Machine = z.infer<typeof MachineSchema>

export const CreateMachineSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  machineRatePerHour: z.number().nonnegative(),
  operatorRatePerHour: z.number().nonnegative(),
  defaultSetupMin: z.number().int().nonnegative(),
})
export type CreateMachine = z.infer<typeof CreateMachineSchema>

export const UpdateMachineSchema = CreateMachineSchema.partial()
export type UpdateMachine = z.infer<typeof UpdateMachineSchema>
