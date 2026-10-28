/**
 * Opvolging (2026-10-28): wat er door de vingers glipt. Twaalf vaste regels,
 * afgesproken met Addy, als meldingen in de groep 'opvolging'. Afgeleid en
 * nooit opgeslagen, net als de andere meldingen: een melding is weg zodra het
 * geregeld is. Ze staan in het belletje en gaan mee naar de assistent, zodat
 * ze ook gevangen worden als de AI het niet doet.
 *
 * Waarom regels en geen AI die zelf rondkijkt: die vindt de ene keer wel wat
 * er glipt en de andere keer niet. Wat glipt benoem je één keer, hier.
 *
 * De gegevens haalt de server erbij (`services/opvolging.ts`); hier alleen de
 * regels. Wat een tegel op het projectenoverzicht ook telt, komt uit
 * dezelfde functies (`project-signalen.ts`).
 */
import type { Project } from '../schemas/project'
import { effectieveSeconden } from '../schemas/tijdregistratie'
import type { Melding } from './meldingen'
import { berekenVoortgang } from './projectvoortgang'
import { isVervallen } from './factuur'
import { kortDatum, plusWerkdagen, vandaagIso } from './inkoop-planning'
import { isOverLevertijd, uitstaandeOffertes, verlooptBinnenWeek } from './project-signalen'

/** De drempels, in werkdagen tenzij anders vermeld. */
export const OPVOLGING = {
  conceptOfferte: 2,
  zonderOfferte: 1,
  opdrachtbevestiging: 1,
  vrijgeven: 2,
  leveren: 2,
  factureren: 2,
  /** Uren op één klok. Bemand: dezelfde grens als de terminal. */
  klokBemandUur: 6,
  /** Een onbemande klok mag 's nachts doorlopen; pas na een etmaal is hij vergeten. */
  klokOnbemandUur: 24,
} as const

/** De dag (yyyy-mm-dd, eigen tijdzone) van een datum of tijdstip. */
function dagVan(datum: string | Date): string {
  if (typeof datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datum)) return datum
  return vandaagIso(new Date(datum))
}

/** Is het `werkdagen` werkdagen na `sinds` (of later)? */
const voorbij = (sinds: string | Date, werkdagen: number, vandaag: string) =>
  vandaag >= plusWerkdagen(dagVan(sinds), werkdagen)

const euro = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STIL = ['geannuleerd', 'on_hold']

/** Regels 1–9: alles wat aan één project te zien is. */
export function projectOpvolging(p: Project, klant: string | null, nu: Date): Melding[] {
  if (p.status === 'geannuleerd') return []
  const vandaag = vandaagIso(nu)
  const uit: Melding[] = []
  const link = `/projecten/${p.id}`
  const wie = klant ? `${p.id} · ${klant}` : `${p.id} · ${p.naam}`
  const melding = (id: string, ernst: Melding['ernst'], titel: string, tekst: string): void => {
    uit.push({ id: `opv:${id}`, groep: 'opvolging', ernst, titel, tekst, link })
  }

  // Een factuur blijft open staan, ook als het project stilligt.
  for (const f of p.facturen) {
    if (!isVervallen(f, nu)) continue
    melding(`vervallen:${f.id}`, 'rood', 'Factuur over de vervaldatum',
      `${f.id} (${euro(f.totaalInclBtw)}) aan ${wie}: vervallen op ${kortDatum(f.vervaldatum!)}, nog niet betaald. Bel na, of zet hem op betaald.`)
  }
  if (STIL.includes(p.status)) return uit

  // 1. Concept-offerte niet verstuurd — alleen zolang het project in de offertefase is.
  if (p.status === 'concept' || p.status === 'offerte') {
    for (const o of p.offertes) {
      if (o.status !== 'concept' || o.direct || !voorbij(o.createdAt, OPVOLGING.conceptOfferte, vandaag)) continue
      melding(`concept:${o.id}`, 'oranje', 'Concept-offerte niet verstuurd',
        `${o.documentNr} v${o.versie} voor ${wie} staat sinds ${kortDatum(dagVan(o.createdAt))} in concept. Versturen, of intrekken als hij niet meer nodig is.`)
    }
  }

  // 2. Project zonder offerte: aangemaakt (vaak met een ingelezen mail), en er gebeurde niets mee.
  if (p.status === 'concept' && p.offertes.length === 0 && !p.opdrachtbevestiging
    && voorbij(p.createdAt, OPVOLGING.zonderOfferte, vandaag)) {
    melding(`zonder-offerte:${p.id}`, 'oranje', 'Project zonder offerte',
      `${wie} (${p.naam}) is ${kortDatum(dagVan(p.createdAt))} aangemaakt en heeft nog geen offerte. Lees de aanvraag in of maak de offerte.`)
  }

  // 3. Geaccepteerd, maar de opdrachtbevestiging is niet verstuurd.
  const acc = p.offertes.find((o) => o.status === 'geaccepteerd')
  if (acc && (p.status === 'bevestigd' || p.status === 'productie') && !p.opdrachtbevestiging?.verzondenOp
    && voorbij(acc.geaccepteerdOp ?? acc.updatedAt, OPVOLGING.opdrachtbevestiging, vandaag)) {
    melding(`ob:${p.id}`, 'oranje', 'Opdrachtbevestiging niet verstuurd',
      `${wie}: geaccepteerd op ${kortDatum(dagVan(acc.geaccepteerdOp ?? acc.updatedAt))}, maar de klant heeft nog geen opdrachtbevestiging${p.opdrachtbevestiging ? ' (hij staat in concept)' : ''}.`)
  }

  // 4. Geaccepteerd, nog niet in productie gegeven.
  const wachtend = p.productieOrders.filter((o) => o.status === 'voorbereiding' && voorbij(o.createdAt, OPVOLGING.vrijgeven, vandaag))
  if (wachtend.length) {
    const sinds = wachtend.map((o) => dagVan(o.createdAt)).sort()[0]
    melding(`vrijgeven:${p.id}`, 'oranje', 'Nog niet in productie gegeven',
      `${wie}: ${wachtend.length === 1 ? `${wachtend[0].artikelNaam} wacht` : `${wachtend.length} orders wachten`} sinds ${kortDatum(sinds)} op in productie geven.`)
  }

  const v = berekenVoortgang(p)

  // 5. De afgesproken leverdatum is voorbij en niet alles is geleverd.
  if (isOverLevertijd(p, nu)) {
    melding(`levertijd:${p.id}`, 'rood', 'Over levertijd',
      `${wie}: levering was ${kortDatum(p.levertijdDatum!.slice(0, 10))}, ${v.verstuurd} van ${v.besteld} stuks geleverd.`)
  }

  // 6. Gemaakt, nog niet geleverd. Sinds: wanneer de oudste order die klaarligt gereed kwam.
  if (v.klaar > 0) {
    const klaarRegels = new Set(v.regels.filter((r) => r.klaar > 0).map((r) => r.offerteRegelId))
    const gereedOp = p.productieOrders
      .filter((o) => klaarRegels.has(o.offerteRegelId) && o.aantalGereed > 0)
      .map((o) => o.stappen.map((s) => s.gereedOp).filter((x): x is string => !!x).sort().pop() ?? o.updatedAt)
      .map(dagVan).sort()[0]
    if (gereedOp && voorbij(gereedOp, OPVOLGING.leveren, vandaag)) {
      melding(`leveren:${p.id}`, 'oranje', 'Gemaakt, nog niet geleverd',
        `${wie}: ${v.klaar} stuks liggen sinds ${kortDatum(gereedOp)} klaar. Maak de pakbon.`)
    }
  }

  // 7. Geleverd, nog niet gefactureerd: wat langer dan de drempel geleden verstuurd is.
  const grens = plusWerkdagen(vandaag, -OPVOLGING.factureren)
  const verstuurdTotGrens = p.paklijsten
    .filter((pl) => pl.verzondenOp && dagVan(pl.verzondenOp) <= grens)
    .reduce((s, pl) => s + pl.regels.reduce((t, r) => t + r.qty, 0), 0)
  if (v.teFactureren > 0 && v.gefactureerd < verstuurdTotGrens) {
    melding(`factureren:${p.id}`, 'oranje', 'Geleverd, nog niet gefactureerd',
      `${wie}: ${v.teFactureren} stuks (${euro(v.teFacturerenBedrag)} excl. btw) zijn geleverd en nog niet gefactureerd.`)
  }
  // …en een factuur die wel gemaakt is maar in concept blijft liggen: de klant heeft hem niet.
  for (const f of p.facturen) {
    if (f.verzondenOp || !voorbij(f.createdAt, OPVOLGING.factureren, vandaag)) continue
    melding(`conceptfactuur:${f.id}`, 'oranje', `Concept-${f.soort === 'credit' ? 'credit' : 'factuur'} niet verstuurd`,
      `${f.id} (${euro(f.totaalInclBtw)}) voor ${wie} staat sinds ${kortDatum(dagVan(f.createdAt))} in concept.`)
  }

  // 9. Een verstuurde offerte zonder antwoord verloopt binnen een week (of is al verlopen).
  for (const o of uitstaandeOffertes(p)) {
    if (!verlooptBinnenWeek(o, nu)) continue
    const tot = o.geldigTot!.slice(0, 10)
    melding(`verloopt:${o.id}`, 'oranje', tot < vandaag ? 'Offerte verlopen zonder antwoord' : 'Offerte verloopt binnenkort',
      `${o.documentNr} aan ${wie}: geldig tot ${kortDatum(tot)}. Bel na, en verleng of trek hem in.`)
  }
  return uit
}

export interface KlokVoorOpvolging {
  id: string
  projectId: string
  artikelNaam: string
  machineNaam: string | null
  userNaam: string | null
  bemand: boolean
  gemetenSeconden: number
  bijgesteldeSeconden: number | null
  lopendSinds: string | null
}

/** 10. Een klok die al lang loopt is bijna altijd vergeten, en dan groeit de nacalculatie door. */
export function klokOpvolging(k: KlokVoorOpvolging, nu: Date): Melding | null {
  if (!k.lopendSinds) return null
  const grensUur = k.bemand ? OPVOLGING.klokBemandUur : OPVOLGING.klokOnbemandUur
  const uren = effectieveSeconden(k, nu) / 3600
  if (uren <= grensUur) return null
  const wie = k.bemand ? (k.userNaam ?? 'Iemand') : 'Onbemand'
  return {
    id: `opv:klok:${k.id}`, groep: 'opvolging', ernst: 'oranje', titel: 'Klok loopt al lang', link: '/tijdregistratie',
    tekst: `${wie} op ${k.machineNaam ?? 'een machine'}: ${k.artikelNaam} (${k.projectId}) loopt al ${Math.floor(uren)} uur. Vergeten te stoppen? Stop hem op de terminal of corrigeer hem bij Tijdregistratie.`,
  }
}

export interface TodoVoorOpvolging {
  id: string
  titel: string
  /** yyyy-mm-dd */
  deadline: string | null
  opgepaktDoor: string | null
}

/** 11. Een todo voorbij zijn deadline. */
export function todoOpvolging(t: TodoVoorOpvolging, vandaag: string): Melding | null {
  if (!t.deadline || t.deadline >= vandaag) return null
  return {
    id: `opv:todo:${t.id}`, groep: 'opvolging', ernst: 'oranje', titel: 'Todo over de deadline', link: '/todos',
    tekst: `"${t.titel}" had ${kortDatum(t.deadline)} af moeten zijn${t.opgepaktDoor ? ` (opgepakt door ${t.opgepaktDoor})` : ', en niemand heeft hem opgepakt'}.`,
  }
}

/** 12. Een artikel in een open offerte of order zonder recept: de kostprijs is € 0, dus de prijs klopt niet. */
export function receptOpvolging(a: { id: string; naam: string; projecten: string[] }): Melding {
  const waar = a.projecten.length > 3 ? `${a.projecten.slice(0, 3).join(', ')} en nog ${a.projecten.length - 3}` : a.projecten.join(', ')
  return {
    id: `opv:recept:${a.id}`, groep: 'opvolging', ernst: 'oranje', titel: 'Artikel zonder recept', link: `/artikelen/${encodeURIComponent(a.id)}`,
    tekst: `${a.naam} staat in ${waar}, maar heeft nog geen recept: de kostprijs is € 0. Maak het recept.`,
  }
}
