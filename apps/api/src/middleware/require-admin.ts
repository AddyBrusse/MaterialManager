import { Request, Response, NextFunction } from 'express'
import { AppError } from './error'

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return next(new AppError(403, 'FORBIDDEN', 'Alleen admins mogen dit doen'))
  }
  next()
}
