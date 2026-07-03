import { z } from 'zod'

export const TodoPrioritySchema = z.enum(['low', 'normal', 'high'])
export type TodoPriority = z.infer<typeof TodoPrioritySchema>

export const TodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  dueDate: z.string().datetime().nullable(),
  priority: TodoPrioritySchema,
  done: z.boolean(),
  completedAt: z.string().datetime().nullable(),
  createdByUserId: z.string().uuid(),
  createdByName: z.string().optional(),
  claimedByUserId: z.string().uuid().nullable(),
  claimedByName: z.string().nullable().optional(),
  claimedAt: z.string().datetime().nullable(),
  calendarEventId: z.string().nullable(),
  notifyOnDue: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Todo = z.infer<typeof TodoSchema>

export const CreateTodoSchema = z.object({
  title: z.string().min(1, 'Omschrijving is verplicht'),
  dueDate: z.string().date().nullable().optional(),
  priority: TodoPrioritySchema.default('normal'),
  notifyOnDue: z.boolean().default(false),
})
export type CreateTodo = z.infer<typeof CreateTodoSchema>

export const UpdateTodoSchema = CreateTodoSchema.partial()
export type UpdateTodo = z.infer<typeof UpdateTodoSchema>

export const SetCalendarEventSchema = z.object({
  calendarEventId: z.string().min(1),
})
export type SetCalendarEvent = z.infer<typeof SetCalendarEventSchema>
