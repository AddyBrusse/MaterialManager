import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/client'
import { AppError } from './error'

declare global {
  namespace Express {
    interface Request {
      user: { id: string; name: string; role: 'admin' | 'user' }
    }
  }
}

export async function userContext(req: Request, res: Response, next: NextFunction) {
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
}
