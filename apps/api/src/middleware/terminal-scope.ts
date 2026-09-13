import { Request, Response, NextFunction } from 'express'
import { AppError } from './error'

/**
 * Wat een machinescherm op de werkvloer mag zien.
 *
 * De app toont kostprijzen, marges en klantgegevens. Een pc in de hal waar
 * iedereen langsloopt hoort daar niet bij te kunnen, dus krijgt zo'n scherm een
 * eigen rol in plaats van een gewone gebruiker met een herkenbare naam. Een naam
 * is geen slot; een rol wel, want die valt serverside af te dwingen.
 *
 * Bewust een toelaatlijst en geen verbodslijst: een nieuwe route is dan
 * standaard dicht voor de terminal in plaats van standaard open. Een vergeten
 * regel levert hooguit een kapot kioskscherm op, niet een prijslijst in de hal.
 */
const TOEGESTAAN: RegExp[] = [
  // De klok zelf — het enige waar de terminal voor bestaat.
  /^\/tijdregistratie(\/|$)/,
  // De namenlijst, zodat de operator zichzelf kan kiezen bij bemand werk.
  // Alleen lezen; aanmaken en wijzigen valt hieronder niet.
  /^\/users$/,
  // De wachtrij van de machine en de stappen erin.
  /^\/projects(\/|$)/,
  /^\/machines$/,
  // Tekening en instelblad bij de actieve stap.
  /^\/articles\/[^/]+$/,
  /^\/documenten(\/|$)/,
  // Welke staaf en welke lengte er bij deze order hoort. Werkvloerinformatie,
  // geen prijs: de zaagbon zegt niets over wat het kost.
  // req.path bevat de querystring niet, dus geen ? in dit patroon.
  /^\/reservations$/,
]

const ALLEEN_LEZEN = new Set(['GET', 'HEAD'])

export function terminalScope(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'terminal') return next()

  // De klok is het enige waar een terminal mag schrijven. Alle andere
  // toegestane routes zijn er om iets te tonen.
  const isKlok = /^\/tijdregistratie(\/|$)/.test(req.path)
  if (!isKlok && !ALLEEN_LEZEN.has(req.method)) {
    return next(new AppError(403, 'FORBIDDEN', 'Een terminal mag alleen tijd registreren'))
  }

  if (!TOEGESTAAN.some((p) => p.test(req.path))) {
    return next(new AppError(403, 'FORBIDDEN', 'Dit scherm is niet beschikbaar op een terminal'))
  }
  next()
}
