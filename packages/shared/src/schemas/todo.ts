import { z } from 'zod'

export const TodoPrioritySchema = z.enum(['low', 'normal', 'high'])
export type TodoPriority = z.infer<typeof TodoPrioritySchema>

/** Wat een door het programma aangemaakte todo aanstuurt. Een handmatige todo
 *  heeft geen soort — die draagt alleen een zin.
 *
 *  `verbeterpunt` (2026-10-24) komt van de knop "Dit klopt niet": iemand zag iets
 *  in het programma zelf. Staat op een eigen tab, niet tussen het werk. */
export const TodoSoortSchema = z.enum(['materiaal_selecteren', 'bestellen', 'verbeterpunt'])
export type TodoSoort = z.infer<typeof TodoSoortSchema>

/**
 * Wat er bij een verbeterpunt vanzelf meegaat, zodat wie het oppakt niet hoeft
 * te vragen "waar was dit, en wat stond er?".
 */
export const VerbeterpuntContextSchema = z.object({
  /** Venster in CSS-pixels en de schaal van het scherm (Windows 125 % = 1,25). */
  scherm: z.object({
    breedte: z.number().int().nonnegative(),
    hoogte: z.number().int().nonnegative(),
    schaal: z.number().positive(),
  }).optional(),
  browser: z.string().max(400).optional(),
  /** Op de terminal: wie er aan de machine stond (het account is de machine). */
  operator: z.string().max(100).optional(),
  /**
   * Hoe de schermafbeelding tot stand kwam. `nagebouwd` is de pagina zoals de
   * browser hem na kon tekenen — bijna altijd gelijk, maar niet gegarandeerd;
   * `geplakt` is een echte schermafdruk die de gebruiker er zelf overheen zette.
   */
  schermafbeelding: z.enum(['nagebouwd', 'geplakt', 'geen']).default('geen'),
  /** De laatste foutmeldingen van vlak ervoor: vaak precies waar het over gaat. */
  fouten: z.array(z.object({
    tijd: z.string().datetime(),
    titel: z.string().max(300),
    tekst: z.string().max(2000),
  })).max(10).default([]),
})
export type VerbeterpuntContext = z.infer<typeof VerbeterpuntContextSchema>

export const TodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  soort: TodoSoortSchema.nullable().default(null),
  projectId: z.string().nullable().default(null),
  artikelId: z.string().nullable().default(null),
  offerteRegelId: z.string().nullable().default(null),
  // Alleen bij een verbeterpunt.
  paginaUrl: z.string().nullable().default(null),
  paginaNaam: z.string().nullable().default(null),
  /** Pad onder /uploads, of null zonder schermafbeelding. */
  schermafbeelding: z.string().nullable().default(null),
  context: VerbeterpuntContextSchema.nullable().default(null),
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

/**
 * Een verbeterpunt aanmaken. De zin wordt de titel van de todo; de
 * schermafbeelding gaat apart mee als bestand (multipart).
 */
export const CreateVerbeterpuntSchema = z.object({
  zin: z.string().trim().min(1, 'Schrijf in een zin wat er niet klopt').max(2000),
  /** Pad plus zoekdeel binnen de app, bijvoorbeeld "/projecten/PRJ-2026-001?tab=orders". */
  paginaUrl: z.string().min(1).max(2000),
  paginaNaam: z.string().max(200).nullable().default(null),
  context: VerbeterpuntContextSchema,
})
export type CreateVerbeterpunt = z.infer<typeof CreateVerbeterpuntSchema>

export const SetCalendarEventSchema = z.object({
  calendarEventId: z.string().min(1),
})
export type SetCalendarEvent = z.infer<typeof SetCalendarEventSchema>
