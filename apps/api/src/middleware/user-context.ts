import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from './error'

declare global {
  namespace Express {
    interface Request {
      user: { id: string; name: string; role: 'admin' | 'user' }
    }
  }
}

/**
 * Wie doet dit verzoek? — features/23-users-roles.md.
 *
 * Ingepakt in `asyncHandler`, en dat is hier geen formaliteit. Express 4 vangt
 * een afgewezen promise uit async middleware niet op; die wordt een unhandled
 * rejection, en Node stopt daarop het proces. Deze middleware zit vóór álle
 * /api-routes en doet een databasevraag, dus één moment dat de database er niet
 * is nam de hele API mee — waargenomen 2026-09-10: de eerste binnenkomende
 * aanvraag na het wegvallen van Postgres beëindigde het proces, waarna alles
 * ECONNREFUSED gaf. Dat ziet eruit als "de app is stuk" terwijl alleen de
 * database weg was.
 *
 * Nu gaat zo'n fout naar de foutafhandeling, geeft hij een 500 met een reden, en
 * blijft de API staan tot de database terug is.
 */
export const userContext = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const userId = req.headers['x-user-id']
  if (!userId || typeof userId !== 'string') {
    return next(new AppError(401, 'UNAUTHORIZED', 'x-user-id header ontbreekt'))
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Gebruiker niet gevonden'))
  }
  req.user = { id: user.id, name: user.name, role: user.role as 'admin' | 'user' }
  next()
})
