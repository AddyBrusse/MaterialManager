import fs from 'fs'
import path from 'path'
import type { Prisma, PrismaClient } from '@prisma/client'
import type {
  CandidateLine,
  MailAddress,
  MailAttachment,
  MailImport,
  NormalizedMail,
  SenderResolution,
} from '@stockmanager/shared'
import { config } from '../config'
import { sanitizeFilename } from '../lib/filenames'
import { parseMsg, readAttachments } from './msg-parse'
import { dedupeKey, resolveSender, type OwnIdentity } from './mail-sender'
import { extractLines } from './extract-lines'
import { matchLines, type AliasCandidate, type ArticleCandidate } from './match-articles'

/**
 * Binnenhalen van een mail — features/60-mail-import.md §3.1–§3.2.
 *
 * De route blijft dun: parsen, uitzoeken wie de klant is, opslaan. Wat er
 * daarna mee gebeurt (regels extraheren, project aanmaken) is een volgende stap
 * en gebeurt pas ná menselijke controle.
 */

// ── Eigen identiteit ──────────────────────────────────────────────────────────

function domainOf(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  return at === -1 ? null : email.slice(at + 1).toLowerCase().trim() || null
}

/**
 * Welke adressen en domeinen zijn van onszelf?
 *
 * Ingesteld in Instellingen → Bedrijf. Staat daar niets, dan afgeleid uit het
 * bedrijfsmailadres en de M365-adressen van de gebruikers — zo werkt de
 * doorgestuurd-check ook vóórdat iemand dit ooit heeft ingevuld.
 */
export async function loadOwnIdentity(prisma: PrismaClient): Promise<OwnIdentity> {
  const [company, users] = await Promise.all([
    prisma.company.findUnique({ where: { id: 'default' } }),
    prisma.user.findMany({ where: { email: { not: null } }, select: { email: true } }),
  ])

  const emails = users.map((u) => u.email as string).filter(Boolean)
  const configured = Array.isArray(company?.eigenDomeinen)
    ? (company?.eigenDomeinen as unknown[]).filter((d): d is string => typeof d === 'string' && d.trim() !== '')
    : []

  const domains = configured.length
    ? configured.map((d) => d.trim().toLowerCase())
    : [domainOf(company?.email), ...emails.map(domainOf)].filter((d): d is string => d !== null)

  return { domains: [...new Set(domains)], emails }
}

// ── Relatie-suggestie ─────────────────────────────────────────────────────────

/** Het minimum dat nodig is om een relatie te herkennen — houdt dit testbaar. */
export interface RelatieMatchCandidate {
  id: string
  naam: string
  email?: string | null
  emailOfferte?: string | null
  emailFactuur?: string | null
  contacten?: unknown
}

export interface RelatieSuggestion {
  relatieId: string
  reden: string
}

/** Gratis-mailproviders: het domein zegt daar niets over welk bedrijf het is. */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.nl', 'outlook.com', 'live.nl', 'live.com',
  'msn.com', 'yahoo.com', 'icloud.com', 'me.com', 'ziggo.nl', 'kpnmail.nl', 'telfort.nl', 'planet.nl',
  'home.nl', 'xs4all.nl', 'upcmail.nl', 'casema.nl', 'chello.nl', 'zonnet.nl',
])

function contactEmails(contacten: unknown): string[] {
  // Json-kolom: meestal al een array, maar een rij die ooit als string is
  // weggeschreven mag geen contacten laten verdwijnen.
  if (typeof contacten === 'string') {
    try {
      return contactEmails(JSON.parse(contacten))
    } catch {
      return []
    }
  }
  if (!Array.isArray(contacten)) return []
  return contacten
    .map((c) => (c && typeof c === 'object' ? (c as { email?: unknown }).email : null))
    .filter((e): e is string => typeof e === 'string' && e.includes('@'))
}

function emailsOf(r: RelatieMatchCandidate): string[] {
  return [r.email, r.emailOfferte, r.emailFactuur, ...contactEmails(r.contacten)]
    .filter((e): e is string => typeof e === 'string' && e.trim() !== '')
    .map((e) => e.toLowerCase().trim())
}

/**
 * Welke relatie hoort bij deze klant? Adres eerst, dan domein, dan naam.
 *
 * Geeft bewust niets terug bij twijfel: een verkeerd gekoppelde relatie levert
 * een offerte met de verkeerde prijzen bij de verkeerde klant op, en dat is
 * duurder dan een lege suggestie.
 */
export function suggestRelatie(
  klant: MailAddress | null,
  relaties: RelatieMatchCandidate[]
): RelatieSuggestion | null {
  if (!klant) return null

  const email = klant.email?.toLowerCase().trim() || null
  if (email) {
    const exact = relaties.find((r) => emailsOf(r).includes(email))
    if (exact) return { relatieId: exact.id, reden: `E-mailadres komt overeen met ${exact.naam}.` }

    const domain = domainOf(email)
    if (domain) {
      // Alleen als precies één relatie dat domein voert. Twee klanten op
      // hetzelfde domein (of een gedeeld domein als gmail.com) is geen match.
      const byDomain = relaties.filter((r) => emailsOf(r).some((e) => domainOf(e) === domain))
      if (byDomain.length === 1) {
        return { relatieId: byDomain[0].id, reden: `Maildomein komt overeen met ${byDomain[0].naam}.` }
      }
    }
  }

  // Geen enkel adres bij de relatie opgeslagen? Dan blijft het maildomein van
  // de afzender over: "DickBoer@stinis.com" tegen een relatie die "Stinis"
  // heet. Zwak bewijs, dus alleen bij precies één treffer en nooit bij een
  // gratis-mailadres — een klant die vanaf gmail mailt zegt niets over
  // welk bedrijf het is.
  const domain = domainOf(email)
  const label = domain && !FREE_MAIL_DOMAINS.has(domain) ? domain.split('.')[0] : null
  if (label && label.length >= 3) {
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '')
    const hits = relaties.filter((r) => {
      const rn = norm(r.naam)
      return rn === label || rn.startsWith(label) || label.startsWith(rn)
    })
    if (hits.length === 1) {
      return { relatieId: hits[0].id, reden: `Maildomein lijkt op ${hits[0].naam}. Controleer dit.` }
    }
  }

  // Zonder adres blijft alleen de weergavenaam over — dat gebeurt bij inline
  // doorgestuurde mail waar de afzender uit het adresboek kwam (§3.2).
  const naam = klant.naam?.toLowerCase().trim()
  if (naam && naam.length >= 3) {
    const hits = relaties.filter((r) => {
      const rn = r.naam.toLowerCase()
      return rn === naam || naam.includes(rn) || rn.includes(naam)
    })
    if (hits.length === 1) {
      return { relatieId: hits[0].id, reden: `Naam lijkt op ${hits[0].naam}. Controleer dit.` }
    }
  }

  return null
}

// ── Regels en artikelen ──────────────────────────────────────────────────────

async function loadArticles(prisma: PrismaClient): Promise<ArticleCandidate[]> {
  return prisma.article.findMany({ select: { id: true, naam: true, tekening: true, rev: true } })
}

async function loadAliases(prisma: PrismaClient, relatieId: string | null): Promise<AliasCandidate[]> {
  if (!relatieId) return []
  return prisma.articleAlias.findMany({
    where: { relatieId },
    select: { externalRef: true, articleId: true },
  })
}

/** Regels uit een mail halen en meteen tegen de artikelen leggen. */
export async function buildCandidates(
  prisma: PrismaClient,
  mail: NormalizedMail,
  relatieId: string | null
) {
  const [articles, aliases] = await Promise.all([loadArticles(prisma), loadAliases(prisma, relatieId)])
  return matchLines(extractLines(mail), articles, aliases)
}

/**
 * Opnieuw matchen met de aliassen van een andere relatie.
 *
 * Nodig zodra iemand in het reviewscherm de relatie corrigeert: de geleerde
 * koppelingen van de nieuwe klant kunnen regels raken die eerst niets opleverden.
 */
export async function rematchCandidates(
  prisma: PrismaClient,
  kandidaten: CandidateLine[],
  relatieId: string | null
): Promise<CandidateLine[]> {
  const [articles, aliases] = await Promise.all([loadArticles(prisma), loadAliases(prisma, relatieId)])
  const rematched = matchLines(
    kandidaten.map((k) => ({ ...k, matches: [], status: 'nieuw' as const, artikelId: null })),
    articles,
    aliases
  )
  // Een handmatige keuze blijft staan — maar wél met de verse kandidatenlijst
  // eronder, zodat het reviewscherm nog steeds alternatieven kan tonen.
  return rematched.map((fresh, i) =>
    kandidaten[i].handmatig
      ? { ...fresh, artikelId: kandidaten[i].artikelId, status: kandidaten[i].status, handmatig: true }
      : fresh
  )
}

// ── Opslaan ───────────────────────────────────────────────────────────────────

export function mailImportDir(id: string): string {
  return path.join(config.uploadsDir, 'mail-imports', id)
}

/** Uniek maken binnen één map, zodat twee gelijke bijlagenamen elkaar niet overschrijven. */
function uniqueName(dir: string, filename: string): string {
  const safe = sanitizeFilename(filename)
  if (!fs.existsSync(path.join(dir, safe))) return safe
  const ext = path.extname(safe)
  const base = safe.slice(0, safe.length - ext.length)
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})${ext}`
    if (!fs.existsSync(path.join(dir, candidate))) return candidate
  }
  return `${Date.now()}-${safe}`
}

export interface IngestResult {
  mailImport: MailImport
  /** True als deze mail al eerder binnengehaald was; er is dan niets nieuws gemaakt. */
  duplicate: boolean
}

export async function ingestMsgBuffer(
  prisma: PrismaClient,
  buf: Buffer,
  source: NormalizedMail['source'] = 'drop'
): Promise<IngestResult> {
  const { mail, embedded } = parseMsg(buf, source)
  const own = await loadOwnIdentity(prisma)
  const resolutie = resolveSender(mail, embedded, own)
  const key = dedupeKey(mail)

  // Dezelfde mail twee keer inslepen is geen fout — dat gebeurt gewoon. De
  // bestaande import teruggeven is nuttiger dan een foutmelding.
  const existing = await prisma.mailImport.findUnique({ where: { dedupeKey: key } })
  if (existing) return { mailImport: serializeMailImport(existing), duplicate: true }

  const relaties = await prisma.relatie.findMany({
    where: { type: { in: ['klant', 'beide'] } },
    select: { id: true, naam: true, email: true, emailOfferte: true, emailFactuur: true, contacten: true },
  })
  const suggestion = suggestRelatie(resolutie.klant, relaties)

  // Regels uit de mail halen en tegen de artikeldatabase leggen (§3.4/§3.5).
  // Aliassen alleen van de vermoedelijke relatie: "P-4471" betekent iets
  // anders bij een andere klant.
  const kandidaten = await buildCandidates(prisma, mail, suggestion?.relatieId ?? null)

  const created = await prisma.mailImport.create({
    data: {
      source,
      messageId: mail.messageId,
      dedupeKey: key,
      afzenderNaam: mail.from?.naam ?? null,
      afzenderEmail: mail.from?.email ?? null,
      onderwerp: mail.subject,
      ontvangenOp: mail.receivedAt ? new Date(mail.receivedAt) : null,
      bodyText: mail.bodyText,
      bijlagen: [],
      resolutie: resolutie as unknown as Prisma.InputJsonValue,
      relatieId: suggestion?.relatieId ?? null,
      kandidaten: kandidaten as unknown as Prisma.InputJsonValue,
      status: 'nieuw',
    },
  })

  // Pas ná het aanmaken wegschrijven: de map heet naar het id, zodat alles van
  // één import bij elkaar staat als je de uploads-map op de NAS openslaat.
  const dir = mailImportDir(created.id)
  fs.mkdirSync(dir, { recursive: true })

  let bodyHtmlPath: string | null = null
  if (mail.bodyHtml) {
    fs.writeFileSync(path.join(dir, 'body.html'), mail.bodyHtml, 'utf8')
    bodyHtmlPath = `/uploads/mail-imports/${created.id}/body.html`
  }

  const bijlagen: MailAttachment[] = readAttachments(buf).map((a) => {
    const name = uniqueName(dir, a.filename)
    fs.writeFileSync(path.join(dir, name), a.content)
    return {
      filename: a.filename,
      sizeBytes: a.content.length,
      path: `/uploads/mail-imports/${created.id}/${name}`,
      isEmbeddedMessage: a.isEmbeddedMessage,
    }
  })

  const saved = await prisma.mailImport.update({
    where: { id: created.id },
    data: { bijlagen: bijlagen as unknown as Prisma.InputJsonValue, bodyHtmlPath },
  })

  return { mailImport: serializeMailImport(saved), duplicate: false }
}

// ── Serialisatie ──────────────────────────────────────────────────────────────

type MailImportRow = {
  id: string
  source: string
  messageId: string | null
  dedupeKey: string
  afzenderNaam: string | null
  afzenderEmail: string | null
  onderwerp: string
  ontvangenOp: Date | null
  bodyText: string
  bodyHtmlPath: string | null
  bijlagen: unknown
  resolutie: unknown
  relatieId: string | null
  intent: string
  kandidaten: unknown
  status: string
  projectId: string | null
  foutmelding: string | null
  createdAt: Date
  updatedAt: Date
}

export function serializeMailImport(row: MailImportRow): MailImport {
  return {
    ...row,
    ontvangenOp: row.ontvangenOp?.toISOString() ?? null,
    bijlagen: (row.bijlagen ?? []) as MailAttachment[],
    resolutie: (row.resolutie ?? null) as SenderResolution | null,
    kandidaten: (row.kandidaten ?? []) as MailImport['kandidaten'],
    source: row.source as MailImport['source'],
    intent: row.intent as MailImport['intent'],
    status: row.status as MailImport['status'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
