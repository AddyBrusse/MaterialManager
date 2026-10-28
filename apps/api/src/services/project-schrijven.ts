import type { Prisma } from '@prisma/client'
import type { Project } from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'
import { PROJECT_INCLUDE, serialize, persist } from './project-store'

// Every mutation of a project goes through this helper: it locks the project row
// (SELECT ... FOR UPDATE) inside a transaction, hands the current state to
// `mutate`, and persists whatever it returns — all on the same connection.
// Without this, concurrent requests against the same project (e.g. staging
// several articles in the ArtikelPickerModal fires one POST per article in
// quick succession) each do their own read-modify-write against the JSONB
// columns; the slower one always wins and silently discards the other's
// change. Locking the row serializes those writes per-project so nothing
// is lost, while unrelated projects are unaffected.
//
// Stond tot 2026-10-28 in routes/projects.ts; hier zodat ook het koppelen van
// een mail (services/mail-koppelen.ts) project, artikelen en taken in één
// transactie kan schrijven.
export async function withProject(
  id: string,
  mutate: (p: Project, tx: Prisma.TransactionClient) => Project | Promise<Project>,
  /** Ruimer dan de standaard 5 s, voor een mutatie die ook bestanden kopieert. */
  opties: { timeoutMs?: number } = {},
): Promise<Project> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${id} FOR UPDATE
    `
    if (locked.length === 0) throw new AppError(404, 'NOT_FOUND', 'Dit project bestaat niet (meer). Ververs de pagina of ga terug naar de lijst.')
    const row = await tx.project.findUniqueOrThrow({ where: { id }, include: PROJECT_INCLUDE })
    const current = serialize(row)
    const next = await mutate(current, tx)
    await persist(tx, next)
    const saved = await tx.project.findUniqueOrThrow({ where: { id }, include: PROJECT_INCLUDE })
    return serialize(saved)
  }, opties.timeoutMs ? { timeout: opties.timeoutMs } : undefined)
}
