import { z } from 'zod'

// Per-user UI preferences: a generic key → JSON store (see model UserPreference).
// The value shape is owned by whichever feature uses the key; the schemas below
// describe the transport plus the shapes we already know about.

export const UserPreferenceSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  updatedAt: z.string(),
})
export type UserPreference = z.infer<typeof UserPreferenceSchema>

export const SaveUserPreferenceSchema = z.object({
  value: z.unknown(),
})
export type SaveUserPreference = z.infer<typeof SaveUserPreferenceSchema>

// ── projects.table ────────────────────────────────────────────────────────────
// Column layout of the projecten list. `order` holds column ids (unknown ids are
// ignored and newly-added columns append, so shipping a new column doesn't
// invalidate a saved layout). `hidden` is opt-out rather than opt-in for the
// same reason. `colors` maps a column id to a tint key from the palette.
export const PROJECT_TABLE_PREFS_KEY = 'projects.table'

export const ProjectTablePrefsSchema = z.object({
  order: z.array(z.string()).default([]),
  hidden: z.array(z.string()).default([]),
  colors: z.record(z.string()).default({}),
})
export type ProjectTablePrefs = z.infer<typeof ProjectTablePrefsSchema>
