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
interface Regel {
  patroon: RegExp
  /** Mag de terminal hier ook schrijven? Standaard niet. */
  schrijven?: boolean
}

const TOEGESTAAN: Regel[] = [
  // De klok zelf — het enige waar de terminal voor bestaat.
  { patroon: /^\/tijdregistratie(\/|$)/, schrijven: true },
  // De namenlijst, zodat de operator zichzelf kan kiezen bij bemand werk.
  // Alleen lezen; aanmaken en wijzigen valt hieronder niet.
  { patroon: /^\/users$/ },
  // Een stap gereedmelden. Dat is het einde van het werk aan de machine en
  // hoort dus op de terminal thuis: de operator weet als enige wanneer het
  // laatste stuk eraf komt. Eén route, geen /projects-breed schrijfrecht —
  // een terminal die offertes kan wijzigen is een prijslijst in de hal.
  //
  // Staat bewust vóór de brede /projects-regel hieronder: de eerste regel die
  // past wint, en die brede regel is alleen-lezen.
  { patroon: /^\/projects\/[^/]+\/orders\/[^/]+\/stap\/[^/]+\/check$/, schrijven: true },
  // De wachtrij van de machine en de stappen erin.
  { patroon: /^\/projects(\/|$)/ },
  { patroon: /^\/machines$/ },
  // Tekening en instelblad bij de actieve stap.
  { patroon: /^\/articles\/[^/]+$/ },
  { patroon: /^\/documenten(\/|$)/ },
  // Welke staaf en welke lengte er bij deze order hoort. Werkvloerinformatie,
  // geen prijs: de zaagbon zegt niets over wat het kost.
  // req.path bevat de querystring niet, dus geen ? in dit patroon.
  { patroon: /^\/reservations$/ },
]

const ALLEEN_LEZEN = new Set(['GET', 'HEAD'])

export function terminalScope(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'terminal') return next()

  const regel = TOEGESTAAN.find((r) => r.patroon.test(req.path))
  if (!regel) {
    return next(new AppError(403, 'FORBIDDEN', 'Dit scherm is niet beschikbaar op een terminal'))
  }
  if (!ALLEEN_LEZEN.has(req.method) && !regel.schrijven) {
    return next(new AppError(403, 'FORBIDDEN', 'Een terminal mag hier alleen lezen'))
  }
  next()
}
