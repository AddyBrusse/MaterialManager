// De klok op een productiestap: starten, pauzeren, hervatten, afronden, corrigeren.
//
// Eén regel bepaalt hier alles: zolang `lopendSinds` gevuld is telt de klok door,
// en `gemetenSeconden` bevat alleen de al gesloten deelmetingen. Zo overleeft een
// lopende klok een herstart van de server zonder tijd te verzinnen, en hoeft geen
// enkel scherm zelf uit te rekenen hoe laat het is.
//
// Wat "werkelijk" betekent staat in `effectieveSeconden` in de gedeelde kern, niet
// hier en niet in de frontend.
import type { Prisma } from '@prisma/client'
import { AppError } from '../middleware/error'
import { effectieveSeconden, type TijdSoort } from '@stockmanager/shared'

type Db = Prisma.TransactionClient

export interface TijdRegistratieRow {
  id: string
  stapId: string
  orderId: string
  projectId: string
  artikelId: string | null
  artikelNaam: string
  soort: string
  bemand: boolean
  status: string
  machineNaam: string | null
  userId: string | null
  userNaam: string | null
  gestartOp: Date
  lopendSinds: Date | null
  gestoptOp: Date | null
  gemetenSeconden: number
  bijgesteldeSeconden: number | null
  correctieReden: string | null
  correctieDoor: string | null
  correctieOp: Date | null
  aantalStuks: number | null
  notitie: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * De vorm die over de lijn gaat. `seconden` wordt hier meegestuurd zodat de
 * client de klok kan laten doorlopen zonder zelf te bepalen wat meetelt — en
 * zodat twee schermen nooit een ander getal tonen voor dezelfde regel.
 */
export function serialize(r: TijdRegistratieRow) {
  return {
    id: r.id,
    stapId: r.stapId,
    orderId: r.orderId,
    projectId: r.projectId,
    artikelId: r.artikelId,
    artikelNaam: r.artikelNaam,
    soort: r.soort,
    bemand: r.bemand,
    status: r.status,
    machineNaam: r.machineNaam,
    userId: r.userId,
    userNaam: r.userNaam,
    gestartOp: r.gestartOp.toISOString(),
    lopendSinds: r.lopendSinds ? r.lopendSinds.toISOString() : null,
    gestoptOp: r.gestoptOp ? r.gestoptOp.toISOString() : null,
    gemetenSeconden: r.gemetenSeconden,
    bijgesteldeSeconden: r.bijgesteldeSeconden,
    correctieReden: r.correctieReden,
    correctieDoor: r.correctieDoor,
    correctieOp: r.correctieOp ? r.correctieOp.toISOString() : null,
    aantalStuks: r.aantalStuks,
    notitie: r.notitie,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    /** Afgeleid, niet opgeslagen — de effectieve duur op dit moment. */
    seconden: effectieveSeconden({
      gemetenSeconden: r.gemetenSeconden,
      bijgesteldeSeconden: r.bijgesteldeSeconden,
      lopendSinds: r.lopendSinds ? r.lopendSinds.toISOString() : null,
    }),
    gecorrigeerd: r.bijgesteldeSeconden !== null,
  }
}

/** Seconden die sinds het begin van de lopende deelmeting verstreken zijn. */
function lopendeDeelmeting(lopendSinds: Date | null, nu: Date): number {
  if (!lopendSinds) return 0
  return Math.max(0, Math.floor((nu.getTime() - lopendSinds.getTime()) / 1000))
}

export interface StartInput {
  stapId: string
  soort: TijdSoort
  bemand: boolean
  operatorId: string | null
  /** Waar het werk werkelijk gebeurt; leeg = waar het gepland stond. */
  machineNaam: string | null
  notitie: string | null
}

/**
 * Start een klok op een stap.
 *
 * Twee klokken op dezelfde stap zou de nacalculatie dubbel laten tellen, dus een
 * al lopende registratie op die stap wordt eerst afgerond. Loopt er al een klok
 * van dezelfde soort, dan is dit een dubbele druk op de knop en geven we die
 * registratie gewoon terug in plaats van een tweede aan te maken.
 */
export async function start(db: Db, input: StartInput, door: { id: string; name: string }) {
  const stap = await db.productieStap.findUnique({
    where: { id: input.stapId },
    include: { order: true },
  })
  if (!stap) throw new AppError(404, 'NOT_FOUND', 'Productiestap niet gevonden')
  if (stap.gereedOp) throw new AppError(409, 'CONFLICT', 'Deze stap is al afgemeld')

  const nu = new Date()
  const lopend = await db.tijdRegistratie.findFirst({
    where: { stapId: input.stapId, status: { in: ['lopend', 'gepauzeerd'] } },
    orderBy: { gestartOp: 'desc' },
  })

  if (lopend) {
    // Dezelfde soort én dezelfde bemanning: dit is een dubbele klik.
    if (lopend.soort === input.soort && lopend.bemand === input.bemand && lopend.status === 'lopend') {
      return serialize(lopend)
    }
    await rondAf(db, lopend, nu, null, null)
  }

  // Bij bemand werk kiest de operator zijn naam op de terminal; het account dat
  // het verzoek doet is daar het machinescherm, niet de persoon.
  const operator = input.bemand && input.operatorId
    ? await db.user.findUnique({ where: { id: input.operatorId } })
    : null
  if (input.bemand && input.operatorId && !operator) {
    throw new AppError(400, 'VALIDATION', 'Gekozen operator bestaat niet')
  }

  const rij = await db.tijdRegistratie.create({
    data: {
      stapId: stap.id,
      orderId: stap.orderId,
      projectId: stap.order.projectId,
      artikelId: stap.order.artikelId,
      artikelNaam: stap.order.artikelNaam,
      soort: input.soort,
      bemand: input.bemand,
      status: 'lopend',
      // De opgegeven machine wint van de geplande: bij een wijziging op het
      // laatste moment is dát de machine die de uren maakt, en de nacalculatie
      // rekent met het tarief van de machine op de registratie.
      machineNaam: input.machineNaam ?? stap.geplandMachine ?? stap.machine,
      userId: input.bemand ? (operator?.id ?? door.id) : null,
      userNaam: input.bemand ? (operator?.name ?? door.name) : null,
      gestartOp: nu,
      lopendSinds: nu,
      gemetenSeconden: 0,
      notitie: input.notitie,
    },
  })
  return serialize(rij)
}

/** Zet de klok stil zonder af te ronden: de deelmeting gaat naar de teller. */
export async function pauzeer(db: Db, id: string) {
  const r = await moetBestaan(db, id)
  if (r.status !== 'lopend') throw new AppError(409, 'CONFLICT', 'Deze klok loopt niet')
  const nu = new Date()
  const rij = await db.tijdRegistratie.update({
    where: { id },
    data: {
      status: 'gepauzeerd',
      gemetenSeconden: r.gemetenSeconden + lopendeDeelmeting(r.lopendSinds, nu),
      lopendSinds: null,
    },
  })
  return serialize(rij)
}

export async function hervat(db: Db, id: string) {
  const r = await moetBestaan(db, id)
  if (r.status !== 'gepauzeerd') throw new AppError(409, 'CONFLICT', 'Deze klok staat niet op pauze')
  const rij = await db.tijdRegistratie.update({
    where: { id },
    data: { status: 'lopend', lopendSinds: new Date() },
  })
  return serialize(rij)
}

/**
 * Wisselen van instellen naar draaien, of van bemand naar onbemand.
 *
 * Dat is geen bewerking van de lopende regel maar het einde ervan: instellen en
 * draaien horen in de nacalculatie in verschillende posten, en onbemande uren
 * kosten geen operator. De oude regel wordt afgerond, er begint een nieuwe.
 */
export async function wissel(
  db: Db,
  id: string,
  naar: { soort?: TijdSoort; bemand?: boolean; operatorId?: string | null },
  door: { id: string; name: string },
) {
  const r = await moetBestaan(db, id)
  if (r.status === 'afgerond') throw new AppError(409, 'CONFLICT', 'Deze registratie is al afgerond')
  const nu = new Date()
  await rondAf(db, r, nu, null, null)
  return start(db, {
    stapId: r.stapId,
    soort: (naar.soort ?? r.soort) as TijdSoort,
    bemand: naar.bemand ?? r.bemand,
    operatorId: naar.operatorId !== undefined ? naar.operatorId : r.userId,
    // Wisselen van soort of bemanning verandert de machine niet: het werk staat
    // nog op dezelfde bank. Zonder dit viel hij bij elke wissel terug op de
    // geplande machine en verdween een omgeboekte klus stilletjes weer.
    machineNaam: r.machineNaam,
    notitie: null,
  }, door)
}

export async function stop(
  db: Db, id: string, aantalStuks: number | null, notitie: string | null,
) {
  const r = await moetBestaan(db, id)
  if (r.status === 'afgerond') throw new AppError(409, 'CONFLICT', 'Deze registratie is al afgerond')
  const rij = await rondAf(db, r, new Date(), aantalStuks, notitie)
  return serialize(rij)
}

async function rondAf(
  db: Db, r: TijdRegistratieRow, nu: Date, aantalStuks: number | null, notitie: string | null,
) {
  return db.tijdRegistratie.update({
    where: { id: r.id },
    data: {
      status: 'afgerond',
      gemetenSeconden: r.gemetenSeconden + lopendeDeelmeting(r.lopendSinds, nu),
      lopendSinds: null,
      gestoptOp: nu,
      aantalStuks: aantalStuks ?? r.aantalStuks,
      notitie: notitie ?? r.notitie,
    },
  })
}

/**
 * Een gemeten tijd bijstellen.
 *
 * De gemeten waarde blijft staan; alleen `bijgesteldeSeconden` komt erbij. Het
 * verschil tussen wat de klok zag en wat een mens ervan maakte is zelf een
 * signaal — een klok die 's avonds vergeten is vervuilt anders stilletjes de
 * dataset waar de calculatie straks op leunt.
 */
export async function corrigeer(
  db: Db,
  id: string,
  input: { bijgesteldeSeconden: number; reden: string; aantalStuks: number | null },
  door: { name: string },
) {
  const r = await moetBestaan(db, id)
  if (r.status !== 'afgerond') {
    throw new AppError(409, 'CONFLICT', 'Rond de registratie eerst af voordat je hem bijstelt')
  }
  const rij = await db.tijdRegistratie.update({
    where: { id },
    data: {
      bijgesteldeSeconden: input.bijgesteldeSeconden,
      correctieReden: input.reden,
      correctieDoor: door.name,
      correctieOp: new Date(),
      aantalStuks: input.aantalStuks ?? r.aantalStuks,
    },
  })
  return serialize(rij)
}

async function moetBestaan(db: Db, id: string): Promise<TijdRegistratieRow> {
  const r = await db.tijdRegistratie.findUnique({ where: { id } })
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Tijdregistratie niet gevonden')
  return r
}

/**
 * Registraties die te lang lopen.
 *
 * De grootste vervuiler van de dataset is de klok die iemand 's avonds vergeet.
 * Automatisch afsluiten zou tijd verzinnen, dus we markeren alleen — een mens
 * beslist wat de juiste waarde was.
 */
export const TE_LANG_SECONDEN = 6 * 3600

export async function lopend(db: Db) {
  const rijen = await db.tijdRegistratie.findMany({
    where: { status: { in: ['lopend', 'gepauzeerd'] } },
    orderBy: { gestartOp: 'asc' },
  })
  return rijen.map(serialize)
}
