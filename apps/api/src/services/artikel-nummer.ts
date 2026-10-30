import type { Prisma } from '@prisma/client'
import { AppError } from '../middleware/error'

type Db = Prisma.TransactionClient

/**
 * Het volgende vrije artikelnummer, `ART-0124`.
 *
 * De teller `ART` in `doc_sequences` liep achter: de browser gaf tot nu toe
 * zelf nummers uit (`nextArtNo` uit zijn eigen kopie) en die gingen langs de
 * teller heen. Een server die alleen op de teller vertrouwde, gaf dan
 * `ART-0001` uit terwijl dat al bestond. Daarom telt hij door vanaf het hoogste
 * nummer dat er staat, en controleert hij of het nummer echt vrij is.
 */
export async function nieuwArtikelId(db: Db): Promise<string> {
  const [{ hoogste }] = await db.$queryRaw<{ hoogste: number }[]>`
    SELECT COALESCE(MAX(CAST(substring(id FROM '^ART-([0-9]{1,9})$') AS integer)), 0)::int AS hoogste
    FROM articles
  `
  for (let poging = 0; poging < 50; poging++) {
    const [{ last_n }] = await db.$queryRaw<{ last_n: number }[]>`
      INSERT INTO doc_sequences (prefix, last_n) VALUES ('ART', ${hoogste + 1})
      ON CONFLICT (prefix) DO UPDATE SET last_n = GREATEST(doc_sequences.last_n, ${hoogste}) + 1
      RETURNING last_n
    `
    const id = `ART-${String(last_n).padStart(4, '0')}`
    if (!(await db.article.findUnique({ where: { id }, select: { id: true } }))) return id
  }
  throw new AppError(500, 'NUMMER_BEZET', 'Er is geen vrij artikelnummer te vinden: de teller ART loopt vast. Er is niets aangemaakt.')
}
