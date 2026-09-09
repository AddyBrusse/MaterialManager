import fs from 'fs'
import path from 'path'
import type { Prisma, PrismaClient } from '@prisma/client'
import type {
  CandidateLine,
  ExtractieRapport,
  MailAddress,
  MailAttachment,
  MailImport,
  NormalizedMail,
  SenderResolution,
} from '@stockmanager/shared'
import { config } from '../config'
import { sanitizeFilename } from '../lib/filenames'
import { parseMsg, readAttachments, type ExtractedAttachment } from './msg-parse'
import { isZip, pakZipUit } from './zip-uitpakken'
import { dedupeKey, resolveSender, type OwnIdentity } from './mail-sender'
import { bereidVoor, metZipInhoud } from './mail-lezen'
import { MAX_TEXT_CHARS, pdfText } from './pdf-text'
import { matchLines, type AliasCandidate, type ArticleCandidate } from './match-articles'
import { aiEnabled, aiExtract, aiFoutTekst, buildLines, type AttachmentBuffers } from './ai-extract'
import { leidendDocument } from './attachment-kind'
import { buildRapport, scoreLines } from './certainty'

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
  // relatieId hoort erbij: een tekeningnummer is van de klant, dus een gelijk
  // nummer bij een ándere klant mag nooit automatisch voorvullen (§3.5).
  return prisma.article.findMany({
    select: { id: true, naam: true, tekening: true, rev: true, relatieId: true },
  })
}

/** Namen van relaties, zodat het reviewscherm kan zeggen bij wie een artikel hoort. */
async function loadRelatieNamen(prisma: PrismaClient): Promise<Map<string, string>> {
  const rijen = await prisma.relatie.findMany({ select: { id: true, naam: true } })
  return new Map(rijen.map((r) => [r.id, r.naam]))
}

async function loadAliases(prisma: PrismaClient, relatieId: string | null): Promise<AliasCandidate[]> {
  if (!relatieId) return []
  return prisma.articleAlias.findMany({
    where: { relatieId },
    select: { externalRef: true, articleId: true },
  })
}

/**
 * Welk contact bij deze relatie stuurde de mail?
 *
 * Alleen op e-mailadres, want dat is het enige harde bewijs. Een naam die
 * lijkt op een contact is te zwak: bij twee collega's met dezelfde voornaam
 * zit je meteen fout, en een verkeerd contact op een offerte is pijnlijker
 * dan een leeg veld.
 */
export function suggestContact(klantEmail: string | null, contacten: unknown): string | null {
  const email = klantEmail?.toLowerCase().trim()
  if (!email) return null
  // Zelfde voorzichtigheid als contactEmails(): het veld komt uit een Json-kolom
  // en is soms als string weggeschreven.
  const lijst = typeof contacten === 'string' ? veiligeJson(contacten) : contacten
  if (!Array.isArray(lijst)) return null
  const treffers = lijst.filter(
    (c): c is { id: string; email: string } =>
      typeof c?.id === 'string' && typeof c?.email === 'string' &&
      c.email.toLowerCase().trim() === email
  )
  return treffers.length === 1 ? treffers[0].id : null
}

function veiligeJson(v: string): unknown {
  try { return JSON.parse(v) } catch { return null }
}

export interface CandidateResult {
  kandidaten: CandidateLine[]
  rapport: ExtractieRapport
  /** Ordernummer van de klant en gevraagde leverdatum uit het document. */
  klantRef: string | null
  leverdatum: string | null
}

/** Geen bijlage-inhoud bij de hand — dan kan het model geen scan bekijken. */
const GEEN_BUFFERS: AttachmentBuffers = { get: () => undefined }

/**
 * Regels uit een mail halen en meteen tegen de artikelen leggen.
 *
 * Het taalmodel is sinds 2026-09-08 de énige extractor (§6). De patroonmotor is
 * eruit: die kende alleen de vormen die we hadden gezien en gaf op een onbekende
 * layout stilletjes een fout aantal terug. Zonder sleutel of bij een storing
 * levert een mail dus géén regels op, met de reden erbij — dat is de bedoeling.
 * Een leeg scherm vraagt om aandacht, een verkeerd voorgevuld aantal niet.
 *
 * `buffers` draagt de inhoud van de bijlagen, zodat een gescande inkooporder als
 * afbeelding aan het model gegeven kan worden. Bij een herberekening is die
 * inhoud er niet meer; dan leest het model alleen de tekst.
 */
export async function buildCandidates(
  prisma: PrismaClient,
  mail: NormalizedMail,
  relatieId: string | null,
  buffers: AttachmentBuffers = GEEN_BUFFERS
): Promise<CandidateResult> {
  const document = leidendDocument(mail.attachments)?.filename ?? null

  const zonderRegels = (foutmelding: string) => ({
    kandidaten: [],
    klantRef: null,
    leverdatum: null,
    rapport: buildRapport([], {
      aiGebruikt: false,
      model: config.ai.model,
      foutmelding,
      documentGebruikt: document,
    }),
  })

  if (!aiEnabled()) {
    return zonderRegels(
      'Er is niets uitgelezen: het meelezen staat uit of er is geen API-sleutel ingesteld. ' +
        'Voeg de regels handmatig toe, of zet ANTHROPIC_API_KEY.'
    )
  }

  const [articles, aliases, relatieNamen] = await Promise.all([
    loadArticles(prisma), loadAliases(prisma, relatieId), loadRelatieNamen(prisma),
  ])

  try {
    const ai = await aiExtract(mail, buffers)
    const { lines, modelZekerheid } = buildLines(ai.regels, mail, {
      scans: new Set(ai.scans),
      document: ai.document ?? document,
      bevestiging: ai.bevestiging,
    })
    const kandidaten = scoreLines(
      matchLines(lines, articles, aliases, relatieId, relatieNamen),
      modelZekerheid
    )
    return {
      kandidaten,
      klantRef: ai.klantRef,
      leverdatum: ai.leverdatum,
      rapport: buildRapport(kandidaten, {
        aiGebruikt: true,
        model: ai.model,
        foutmelding: null,
        documentGebruikt: ai.document ?? document,
        gescandeBijlagen: ai.scans,
        volledigMeegestuurd: ai.nativeBlokken,
        controleGedaan: ai.bevestiging !== null,
      }),
    }
  } catch (err) {
    return zonderRegels(
      `Er is niets uitgelezen: ${aiFoutTekst(err)}. Probeer de mail opnieuw te slepen, ` +
        'of voeg de regels handmatig toe.'
    )
  }
}

/**
 * Een opgeslagen import opnieuw laten uitlezen — features/60-mail-import.md §3.7.
 *
 * Het originele `.msg` bewaren we niet, maar dat hoeft ook niet: onderwerp,
 * bericht en alle bijlagen staan op schijf, inclusief de uitgelezen pdf-tekst.
 * Daarmee is de genormaliseerde mail weer op te bouwen en kan het model er vers
 * naar kijken — met de bijlage-inhoud erbij, zodat een gescande order nog steeds
 * als afbeelding meegaat.
 *
 * Bedoeld om na een verbetering aan de extractie te kunnen herhalen zonder de
 * mail opnieuw te slepen. Het kost een nieuwe aanroep van het model, dus dit
 * gebeurt alleen als iemand erom vraagt.
 */
export function mailUitRij(row: MailImportRow): NormalizedMail {
  const bijlagen = (row.bijlagen ?? []) as MailAttachment[]
  return {
    source: row.source as NormalizedMail['source'],
    messageId: row.messageId,
    subject: row.onderwerp,
    bodyText: row.bodyText,
    bodyHtml: null,
    receivedAt: row.ontvangenOp?.toISOString() ?? null,
    from: row.afzenderEmail || row.afzenderNaam
      ? { naam: row.afzenderNaam, email: row.afzenderEmail }
      : null,
    to: [],
    cc: [],
    attachments: bijlagen,
    rawHeaders: null,
  }
}

/** De opgeslagen bijlagen van schijf, zodat scans weer als afbeelding meekunnen. */
/**
 * Zips die al op schijf staan alsnog uitpakken.
 *
 * Nodig voor mail die is ingelezen vóórdat het uitpakken bestond: die draagt een
 * bijlagenlijst met alleen de zip erin. "Opnieuw uitlezen" werkt op die
 * opgeslagen lijst, dus zonder dit zou zo'n mail zijn tekeningen nooit krijgen —
 * de enige uitweg was de import weggooien en de mail opnieuw slepen, en dat is
 * geen antwoord dat je aan iemand wilt geven.
 *
 * Geeft de aangevulde lijst terug, of dezelfde lijst als er niets te halen viel.
 */
export async function vulZipsAan(id: string, bijlagen: MailAttachment[]): Promise<MailAttachment[]> {
  const zips = bijlagen.filter((b) => !b.isEmbeddedMessage && isZip(b.filename) && b.path)
  if (zips.length === 0) return bijlagen

  const dir = mailImportDir(id)
  const namen = new Set(bijlagen.map((b) => b.filename.toLowerCase()))
  const nieuw: MailAttachment[] = []

  for (const zip of zips) {
    const bron = path.join(dir, path.basename(zip.path!))
    if (!fs.existsSync(bron)) continue
    for (const f of pakZipUit(fs.readFileSync(bron))) {
      if (namen.has(f.filename.toLowerCase())) continue
      namen.add(f.filename.toLowerCase())
      const naam = uniqueName(dir, f.filename)
      fs.writeFileSync(path.join(dir, naam), f.content)
      const tekst = await pdfText(f.content)
      nieuw.push({
        filename: f.filename,
        sizeBytes: f.content.length,
        path: `/uploads/mail-imports/${id}/${naam}`,
        isEmbeddedMessage: false,
        tekst: tekst ? tekst.slice(0, MAX_TEXT_CHARS) : null,
        tekstPath: null,
      })
    }
  }

  return nieuw.length > 0 ? [...bijlagen, ...nieuw] : bijlagen
}

export function buffersUitMap(id: string, bijlagen: MailAttachment[]): AttachmentBuffers {
  const dir = mailImportDir(id)
  return {
    get(filename: string) {
      const bijlage = bijlagen.find((b) => b.filename === filename)
      if (!bijlage?.path) return undefined
      const opSchijf = path.join(dir, path.basename(bijlage.path))
      try {
        return fs.readFileSync(opSchijf)
      } catch {
        // Bestand weg of map opgeruimd: dan leest het model alleen de tekst.
        return undefined
      }
    },
  }
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
  const [articles, aliases, relatieNamen] = await Promise.all([
    loadArticles(prisma), loadAliases(prisma, relatieId), loadRelatieNamen(prisma),
  ])
  const rematched = matchLines(
    kandidaten.map((k) => ({ ...k, matches: [], status: 'nieuw' as const, artikelId: null })),
    articles,
    aliases,
    relatieId,
    relatieNamen
  )
  // Een handmatige keuze blijft staan — maar wél met de verse kandidatenlijst
  // eronder, zodat het reviewscherm nog steeds alternatieven kan tonen.
  // De zekerheid hangt aan de koppeling, dus die moet mee opnieuw berekend.
  return scoreLines(
    rematched.map((fresh, i) =>
      kandidaten[i].handmatig
        ? { ...fresh, artikelId: kandidaten[i].artikelId, status: kandidaten[i].status, handmatig: true }
        : fresh
    )
  )
}

// ── Opslaan ───────────────────────────────────────────────────────────────────

export function mailImportDir(id: string): string {
  return path.join(config.uploadsDir, 'mail-imports', id)
}

/** Uniek maken binnen één map, zodat twee gelijke bijlagenamen elkaar niet overschrijven. */
export function uniqueName(dir: string, filename: string): string {
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

function loadKlantRelaties(prisma: PrismaClient) {
  return prisma.relatie.findMany({
    where: { type: { in: ['klant', 'beide'] } },
    select: { id: true, naam: true, email: true, emailOfferte: true, emailFactuur: true, contacten: true },
  })
}

export interface IngestResult {
  mailImport: MailImport
  /** True als deze mail al eerder binnengehaald was; er is dan niets nieuws gemaakt. */
  duplicate: boolean
  /** True als die bestaande import opnieuw is uitgelezen omdat er nog niets over beslist was. */
  refreshed?: boolean
}

/**
 * Eén meting wegschrijven. Faalt nooit hard: een mislukte meting mag het
 * inlezen van een mail niet in de weg zitten — het is een hulpmiddel, geen doel.
 */
export async function legMetingVast(
  prisma: PrismaClient,
  meting: {
    mailImportId: string | null
    soort: 'drop' | 'opnieuw'
    bytes: number
    bijlagen: number
    tekens: number
    scans: number
    aiGebruikt: boolean
    controle: boolean
    duurMs: number
    gelukt: boolean
  }
): Promise<void> {
  try {
    await prisma.ingestRun.create({ data: meting })
  } catch {
    /* meten is bijzaak */
  }
}

export async function ingestMsgBuffer(
  prisma: PrismaClient,
  buf: Buffer,
  source: NormalizedMail['source'] = 'drop'
): Promise<IngestResult> {
  const begonnenOp = Date.now()

  // Zips uitpakken, pdf-tekst lezen en de bijlagenlijst opnieuw opbouwen —
  // gedeeld met de scoreset, zie mail-lezen.ts. Die moet hetzelfde pad meten
  // als productie loopt, anders meet hij niets.
  const { mail, embedded, buffers, extracted, teksten } = await bereidVoor(buf, source)

  const own = await loadOwnIdentity(prisma)
  const resolutie = resolveSender(mail, embedded, own)
  const key = dedupeKey(mail)

  // Dezelfde mail twee keer inslepen is geen fout — dat gebeurt gewoon. De
  // bestaande import teruggeven is nuttiger dan een foutmelding.
  const existing = await prisma.mailImport.findUnique({ where: { dedupeKey: key } })
  if (existing) {
    // ...maar wél opnieuw uitlezen zolang er nog niets over beslist is. De mail
    // is dezelfde; onze herkenning kan intussen beter zijn geworden, en de
    // klant of het artikel kan er sindsdien bij zijn gezet. Zonder dit krijg je
    // bij een tweede poging stilzwijgend het oude resultaat terug.
    const oud = (existing.kandidaten ?? []) as CandidateLine[]
    const onaangeroerd =
      !existing.projectId && existing.status === 'nieuw' && !oud.some((k) => k.handmatig)

    if (!onaangeroerd) return { mailImport: serializeMailImport(existing), duplicate: true }

    const relaties = await loadKlantRelaties(prisma)
    const suggestion = existing.relatieId
      ? null
      : suggestRelatie(resolutie.klant, relaties)
    const relatieId = existing.relatieId ?? suggestion?.relatieId ?? null
    const { kandidaten, rapport, klantRef, leverdatum } = await buildCandidates(
      prisma, mail, relatieId, buffers
    )

    const ververst = await prisma.mailImport.update({
      where: { id: existing.id },
      data: {
        relatieId,
        resolutie: resolutie as unknown as Prisma.InputJsonValue,
        kandidaten: kandidaten as unknown as Prisma.InputJsonValue,
        extractie: rapport as unknown as Prisma.InputJsonValue,
        klantRef,
        leverdatum: leverdatum ? new Date(leverdatum) : null,
      },
    })
    return { mailImport: serializeMailImport(ververst), duplicate: true, refreshed: true }
  }

  const relaties = await loadKlantRelaties(prisma)
  const suggestion = suggestRelatie(resolutie.klant, relaties)
  const contactId = suggestion
    ? suggestContact(
        resolutie.klant?.email ?? null,
        relaties.find((r) => r.id === suggestion.relatieId)?.contacten ?? []
      )
    : null

  // Regels uit de mail halen en tegen de artikeldatabase leggen (§3.4/§3.5).
  // Aliassen alleen van de vermoedelijke relatie: "P-4471" betekent iets
  // anders bij een andere klant.
  const { kandidaten, rapport, klantRef, leverdatum } = await buildCandidates(
    prisma,
    mail,
    suggestion?.relatieId ?? null,
    buffers
  )

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
      contactId,
      kandidaten: kandidaten as unknown as Prisma.InputJsonValue,
      extractie: rapport as unknown as Prisma.InputJsonValue,
      klantRef,
      leverdatum: leverdatum ? new Date(leverdatum) : null,
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

  const bijlagen: MailAttachment[] = extracted.map((a, i) => {
    const name = uniqueName(dir, a.filename)
    fs.writeFileSync(path.join(dir, name), a.content)

    // De volledige uitgelezen tekst als los .txt naast de bijlage: in de app
    // wordt een ingekorte versie getoond, maar bij twijfel wil je het geheel
    // kunnen nalezen — ook rechtstreeks op de NAS.
    let tekstPath: string | null = null
    const volledig = teksten[i]
    if (volledig) {
      const txtName = uniqueName(dir, `${name}.txt`)
      fs.writeFileSync(path.join(dir, txtName), volledig, 'utf8')
      tekstPath = `/uploads/mail-imports/${created.id}/${txtName}`
    }

    return {
      filename: a.filename,
      sizeBytes: a.content.length,
      path: `/uploads/mail-imports/${created.id}/${name}`,
      isEmbeddedMessage: a.isEmbeddedMessage,
      tekst: volledig ? volledig.slice(0, MAX_TEXT_CHARS) : null,
      tekstPath,
    }
  })

  const saved = await prisma.mailImport.update({
    where: { id: created.id },
    data: { bijlagen: bijlagen as unknown as Prisma.InputJsonValue, bodyHtmlPath },
  })

  await legMetingVast(prisma, {
    mailImportId: saved.id,
    soort: 'drop',
    bytes: buf.length,
    bijlagen: bijlagen.length,
    tekens: bijlagen.reduce((n, b) => n + (b.tekst?.length ?? 0), 0),
    scans: rapport.gescandeBijlagen.length,
    aiGebruikt: rapport.aiGebruikt,
    controle: rapport.controleGedaan,
    duurMs: Date.now() - begonnenOp,
    gelukt: rapport.foutmelding === null,
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
  contactId: string | null
  extractie: unknown
  klantRef: string | null
  leverdatum: Date | null
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
    extractie: (row.extractie ?? null) as MailImport['extractie'],
    leverdatum: row.leverdatum?.toISOString() ?? null,
    source: row.source as MailImport['source'],
    intent: row.intent as MailImport['intent'],
    status: row.status as MailImport['status'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
