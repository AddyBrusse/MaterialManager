/**
 * Het viewmodel samenstellen uit wat er werkelijk is (keuze A uit het plan).
 *
 * §12 van de spec laat de backend `acties` en `aandacht` meeleveren, zodat de
 * knopstaat op één plek bepaald wordt. Dat endpoint bestaat niet. Daarom wordt
 * het hier afgeleid — maar uitsluitend in pure functies zonder React en zonder
 * fetch, zodat dezelfde functies later op de server kunnen draaien en dit
 * bestand alleen nog hoeft te verdwijnen.
 */

import type { Project, Relatie, Todo } from '@stockmanager/shared'
import { aantalDeelleveringen, berekenVoortgang, gefactureerdInclBtw, isVervallen, openstaandBedrag, laatsteFactuur, laatstePaklijst } from '@stockmanager/shared'
import type { ProjectNacalculatie } from '../../../../api/nacalculatie'
import type { ZaagReservation } from '../../../../api/reservations'
import { houdtVast } from '../../../../api/reservations'
import type { FacetVM, GeldVM, ReserveringVM, TodoVM, ActiviteitVM, TabBadge, TabId } from '../types'
import { datum, datumKort, eur, pct, relatieveDagen, dagenTot, tijdstip } from './format'
import { geaccepteerdeOfferte, geldendeOfferte, ordersGereed, productieAf, stapTelling } from './status'
import { opdrachtGewijzigd } from './tab-actie'
import { afwijkingTekst, kleurClass } from './nacalculatie'

const STATUS_LABEL: Record<Project['status'], string> = {
  concept: 'Concept',
  offerte: 'Offerte',
  bevestigd: 'Bevestigd',
  productie: 'Productie',
  paklijst: 'Gereed voor levering',
  verzonden: 'Geleverd',
  gefactureerd: 'Gefactureerd',
  on_hold: 'On hold',
  geannuleerd: 'Geannuleerd',
}

export function statusLabel(s: Project['status']): string {
  return STATUS_LABEL[s]
}

export function offerteTotaal(p: Project): number | null {
  // Na acceptatie telt de opdracht: die is sinds 2026-09-28 aan te passen
  // (aantal, prijs, regels), en de offerte blijft staan als wat aangeboden werd.
  if (p.opdrachtbevestiging) return p.opdrachtbevestiging.regels.reduce((som, r) => som + r.totaal, 0)
  const o = geldendeOfferte(p)
  if (!o) return null
  return o.regels.reduce((som, r) => som + r.totaal, 0)
}

/** Welk document veroorzaakte de huidige fase — het bijschrift bij facet 2. */
function faseHerkomst(p: Project): string {
  switch (p.status) {
    case 'offerte': {
      const o = geldendeOfferte(p)
      return o ? `door ${o.id}` : ''
    }
    case 'bevestigd': {
      const o = geaccepteerdeOfferte(p)
      return o ? `door acceptatie ${o.id}` : ''
    }
    case 'productie': {
      // Sinds 2026-09-30 door vrijgeven; een afmelding op een order in
      // voorbereiding geeft hem ook vrij, dus dit dekt beide. Is er al iets
      // geleverd terwijl er nog gemaakt wordt, dan zegt dat meer (2026-10-02).
      const n = aantalDeelleveringen(p)
      if (n > 0) return `${n} ${n === 1 ? 'deellevering' : 'deelleveringen'} verstuurd`
      return 'door vrijgave aan de hal'
    }
    case 'paklijst':
      // Gereed voor levering komt van de productie, niet van een pakbon.
      return 'alles is gereedgemeld'
    case 'verzonden': {
      const pl = laatstePaklijst(p)
      return pl ? `door ${pl.id}` : ''
    }
    case 'gefactureerd': {
      const f = laatsteFactuur(p)
      return f ? `door ${f.id}` : ''
    }
    default:
      return ''
  }
}

export function bouwFacetten(
  p: Project,
  relatie: Relatie | null,
  nacalc: ProjectNacalculatie | null,
): FacetVM[] {
  const { gereed, totaal } = stapTelling(p.productieOrders)
  const contact = relatie?.contacten?.find((c) => c.id === p.contactId) ?? null
  const geldend = geldendeOfferte(p)
  const acc = geaccepteerdeOfferte(p)
  const totaalBedrag = offerteTotaal(p)

  const facetten: FacetVM[] = [
    {
      label: 'Klant',
      waarde: relatie?.naam ?? '—',
      sub: [contact?.naam, p.klantRef].filter(Boolean).join(' · ') || undefined,
    },
    {
      label: 'Fase',
      waarde: statusLabel(p.status),
      sub: faseHerkomst(p) || undefined,
      kleur: p.status === 'on_hold' || p.status === 'geannuleerd' ? 'warn' : undefined,
    },
    {
      label: 'Stappen gereed',
      waarde: totaal > 0 ? `${gereed} / ${totaal}` : '—',
      sub:
        p.productieOrders.length > 0
          ? `${ordersGereed(p.productieOrders)} van ${p.productieOrders.length} orders gereed`
          : 'nog geen productieorders',
      meter:
        totaal > 0
          ? { deel: gereed / totaal, gereed: gereed === totaal }
          : undefined,
    },
    {
      label: p.opdrachtbevestiging ? 'Opdrachtwaarde' : 'Offertetotaal',
      waarde: totaalBedrag === null ? '—' : eur(totaalBedrag),
      sub: p.opdrachtbevestiging
        ? `${p.opdrachtbevestiging.id}${p.opdrachtbevestiging.wijzigingen?.length ? ' · aangepast na acceptatie' : ''}`
        : geldend
        ? `${geldend.id}${acc ? ` · v${acc.versie} geaccepteerd` : ` · v${geldend.versie}`}`
        : 'nog geen offerte',
    },
  ]

  // Facet 5 wisselt van betekenis zodra er een factuur is: daarna is de
  // vervaldatum het getal waar iemand naar zoekt, niet de levertijd.
  if (p.facturen.length > 0) {
    // Het bedrag is het totaal mét credits eraf — de losse facturen zeggen niet
    // meer wat de klant werkelijk moet betalen zodra er één credit tussen staat.
    // De vervaldatum is die van de meest urgente openstaande factuur, want dát
    // is de datum waar iemand naar handelt.
    const metDatum = p.facturen
      .filter((f) => f.soort !== 'credit' && f.vervaldatum && !f.betaaldOp)
      .sort((a, b) => String(a.vervaldatum).localeCompare(String(b.vervaldatum)))
    const eerste = metDatum[0] ?? null
    const n = dagenTot(eerste?.vervaldatum)
    const credits = p.facturen.filter((f) => f.soort === 'credit').length
    const aantal = p.facturen.length - credits
    facetten.push({
      label: 'Factuur',
      // Zelfde getal als de Geld-kaart op Algemeen: wat verstuurd is. Pas als er
      // nog niets weg is, het concept — anders staat er € 0,00 zodra er een
      // concept-credit klaarstaat die de klant nog nooit zag.
      waarde: eur(verstuurdGefactureerd(p) ?? gefactureerdInclBtw(p)),
      sub: [
        aantal > 1 ? `${aantal} facturen` : laatsteFactuur(p)?.id,
        credits > 0 ? `${credits} credit${credits > 1 ? 's' : ''}` : null,
        eerste ? `vervalt ${datumKort(eerste.vervaldatum)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      kleur: n !== null && n < 0 ? 'dgr' : n !== null && n <= 14 ? 'warn' : undefined,
    })
  } else {
    const n = dagenTot(p.levertijdDatum)
    facetten.push({
      label: 'Levertijd',
      waarde: datum(p.levertijdDatum),
      sub: relatieveDagen(p.levertijdDatum) || 'geen datum toegezegd',
      kleur: n !== null && n < 0 ? 'dgr' : n !== null && n <= 7 ? 'warn' : undefined,
    })
  }

  const afw = nacalc?.verschilPct ?? null
  facetten.push({
    label: 'Kostprijs',
    waarde: nacalc ? eur(nacalc.werkelijkTotaal) : '—',
    sub: !nacalc
      ? 'nog niets gemeten'
      : nacalc.gemeten
        ? afwijkingTekst(afw)
        : `voorlopig · ${gemetenPosten(nacalc)} van ${nacalc.orders.length * 4} posten gemeten`,
    kleur: nacalc?.gemeten ? kleurClass(afw) || undefined : undefined,
  })

  return facetten
}

function gemetenPosten(n: ProjectNacalculatie): number {
  return n.orders.reduce(
    (som, o) => som + o.regels.filter((r) => r.werkelijk > 0).length,
    0,
  )
}

/** De samenvattingsregel die verschijnt zodra de kop ingeklapt is (§3.1). */
export function bouwSamenvatting(p: Project, relatie: Relatie | null): string {
  const { gereed, totaal } = stapTelling(p.productieOrders)
  const delen = [relatie?.naam ?? 'geen klant']
  if (totaal > 0) delen.push(`stappen gereed ${gereed} / ${totaal}`)
  if (p.levertijdDatum) delen.push(`levertijd ${datum(p.levertijdDatum)}`)
  return delen.join(' · ')
}

/**
 * Het getal rechts van elke tabnaam.
 *
 * Alleen de tékst: de kleur komt sinds de herstyling van de tabbalk uit
 * `bouwTabStanden`. Twee bronnen voor één kleur leverde tabs op die groen
 * kleurden terwijl hun stand amber was.
 */
/** Het tabje Pakbonnen: een concept dat nog weg moet, wat er klaarligt, of hoeveel er de deur uit zijn. */
function pakbonBadge(p: Project): TabBadge {
  const concepten = p.paklijsten.filter((pl) => !pl.verzondenOp).length
  if (concepten > 0) return { tekst: `${concepten} concept`, kleur: 'warn' }
  const klaar = berekenVoortgang(p).klaar
  if (klaar > 0) return { tekst: `${klaar} klaar`, kleur: 'accent' }
  if (p.paklijsten.length === 0) return { tekst: '—' }
  return p.status === 'verzonden' || p.status === 'gefactureerd'
    ? { tekst: `${p.paklijsten.length} ✓`, kleur: 'ok' }
    : { tekst: `${p.paklijsten.length}` }
}

/** Het tabje Facturen: vervallen gaat voor, dan een concept, dan wat open is. */
function factuurBadge(p: Project): TabBadge {
  const vervallen = p.facturen.filter((f) => isVervallen(f)).length
  if (vervallen > 0) return { tekst: `${vervallen} vervallen`, kleur: 'dgr' }
  if (p.facturen.some((f) => !f.verzondenOp)) return { tekst: 'concept', kleur: 'warn' }
  const open = openstaandBedrag(p)
  if (open > 0) return { tekst: `${eur(open)} open`, kleur: 'accent' }
  const te = berekenVoortgang(p).teFacturerenBedrag
  if (te > 0) return { tekst: `${eur(te)} te factureren`, kleur: 'accent' }
  if (p.facturen.some((f) => f.soort === 'factuur')) return { tekst: 'betaald ✓', kleur: 'ok' }
  return { tekst: '—' }
}

export function bouwTabBadges(
  p: Project,
  nacalc: ProjectNacalculatie | null,
  aandacht: { totaal: number; rood: number },
): Record<TabId, TabBadge | null> {
  const { gereed, totaal } = stapTelling(p.productieOrders)
  const acc = geaccepteerdeOfferte(p)
  // Vier stappen op de route; een stap telt mee zodra er mínstens één document
  // van is. Twee pakbonnen maken de route niet langer.
  const documenten = [
    geldendeOfferte(p),
    p.opdrachtbevestiging,
    p.paklijsten.length > 0 ? p.paklijsten[0] : null,
    p.facturen.length > 0 ? p.facturen[0] : null,
  ].filter(Boolean).length
  const afw = nacalc?.verschilPct ?? null
  const voorbereiding = p.productieOrders.filter((o) => o.status === 'voorbereiding').length

  return {
    // Aandacht staat sinds 2026-10-05 op Algemeen; het getal moet dus hier.
    algemeen:
      aandacht.totaal === 0
        ? null
        : { tekst: `${aandacht.totaal} aandacht`, kleur: aandacht.rood > 0 ? 'dgr' : 'warn' },
    offertes:
      p.offertes.length === 0
        ? { tekst: 'geen' }
        : {
            tekst: `${p.offertes.length}${acc ? ` · v${acc.versie} ✓` : ''}`,
            kleur: acc ? 'ok' : undefined,
          },
    opdracht: !p.opdrachtbevestiging
      ? { tekst: '—' }
      : opdrachtGewijzigd(p)
        ? { tekst: 'gewijzigd', kleur: 'warn' }
        : p.opdrachtbevestiging.verzondenOp
          ? { tekst: 'verzonden ✓', kleur: 'ok' }
          : { tekst: 'concept' },
    productie:
      p.productieOrders.length === 0
        ? { tekst: 'geen' }
        : voorbereiding > 0
          ? // Kantoor moet nog vrijgeven (2026-09-30): dat is de volgende stap hier.
            { tekst: `${voorbereiding} vrij te geven`, kleur: 'warn' }
          : productieAf(p.productieOrders)
          ? // Stuks gereedgemeld zonder elke stap af te vinken: "0 van 1 ✓" zou liegen.
            { tekst: totaal > 0 && gereed === totaal ? `${totaal} van ${totaal} ✓` : 'gereed ✓', kleur: 'ok' }
          : { tekst: `${gereed} van ${totaal}`, kleur: 'accent' },
    nacalculatie: !nacalc
      ? { tekst: '—' }
      : !nacalc.gemeten
        ? { tekst: 'voorlopig', kleur: 'warn' }
        : // Zelfde oordeel als de tabel: goedkoper groen, duurder rood.
          { tekst: pct(afw), kleur: kleurClass(afw) || undefined },
    pakbonnen: pakbonBadge(p),
    facturen: factuurBadge(p),
    documenten: p.facturen.some((f) => f.soort !== 'credit' && f.verzondenOp)
      ? { tekst: `${documenten}/4 ✓`, kleur: 'ok' }
      : { tekst: `${documenten}/4` },
  }
}

/** Verstuurde facturen min verstuurde credits, incl. btw; null als er nog niets weg is.
 *  Een concept is nog geen geld dat de klant schuldig is. */
export function verstuurdGefactureerd(p: Project): number | null {
  const verstuurd = p.facturen.filter((f) => f.verzondenOp)
  if (verstuurd.length === 0) return null
  return Math.round(verstuurd.reduce((s, f) => s + (f.soort === 'credit' ? -1 : 1) * f.totaalInclBtw, 0) * 100) / 100
}

export function bouwGeld(p: Project, nacalc: ProjectNacalculatie | null): GeldVM {
  const verkoop = offerteTotaal(p)
  const gefactureerd = verstuurdGefactureerd(p)
  // Over welke orders de kostprijs gaat (keuze 2026-10-05: alleen die mét
  // calculatie, en dat erbij zeggen — orders zonder calculatie als € 0
  // meetellen maakt de marge mooier dan hij is).
  const orders = p.productieOrders.filter((o) => o.status !== 'gestopt').length
  const metCalc = nacalc?.orders.length ?? 0
  const basis = !nacalc || metCalc === 0
    ? null
    : metCalc >= orders
      ? null
      : `Kostprijs over ${metCalc} van ${orders} orders met calculatie${
          nacalc.verkoopTotaal != null ? ` (${eur(nacalc.verkoopTotaal)} verkoop)` : ''
        }`
  return {
    offertetotaal: verkoop,
    gefactureerd,
    openstaand: openstaandBedrag(p),
    kostprijsCalculatie: nacalc?.gecalculeerdTotaal ?? null,
    kostprijsWerkelijk: nacalc?.werkelijkTotaal ?? null,
    verschil: nacalc?.verschilTotaal ?? null,
    verschilPct: nacalc?.verschilPct ?? null,
    margeWerkelijkPct: nacalc?.margeWerkelijkPct ?? null,
    margeCalculatiePct: nacalc?.margeGecalculeerdPct ?? null,
    basis,
  }
}

export function bouwReserveringen(res: ZaagReservation[]): ReserveringVM[] {
  return res.map((r) => {
    const vast = houdtVast(r)
    const lengte = (r.sawLength * r.pieces) / 1000
    return {
      materiaal: `${r.materiaal}${r.diameter ? ` Ø${r.diameter}` : ''}`,
      hoeveelheid: `${lengte.toFixed(2).replace('.', ',')} m`,
      toestand: vast
        ? `gereserveerd · ${r.pieces}× ${r.sawLength} mm · staaf ${r.barCode}`
        : r.status === 'done'
          ? `afgeboekt${r.completedAt ? ` op ${datumKort(r.completedAt)}` : ''}`
          : 'geannuleerd',
      wacht: false,
    }
  })
}

export function bouwTodos(todos: Todo[]): TodoVM[] {
  return todos
    .filter((t) => !t.done)
    .map((t) => ({
      id: t.id,
      titel: t.title,
      materiaal: t.soort === 'materiaal_selecteren',
      herkomst: [
        t.soort === 'materiaal_selecteren' ? 'Materiaal kiezen' : null,
        `aangemaakt ${datumKort(t.createdAt)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }))
}

/**
 * De activiteitenlijst (§7.3). Er is géén logtabel in het datamodel, dus dit is
 * opgebouwd uit de tijdstempels die er wél zijn. Daarmee valt niet te tonen wie
 * een status zette of wie een offerte wijzigde; komt er ooit een echte
 * audittabel, dan past die in exact dezelfde regelvorm.
 */
export function bouwActiviteit(p: Project): ActiviteitVM[] {
  const uit: { iso: string; tekst: string }[] = []

  for (const o of p.offertes) {
    if (o.verzondenOp) uit.push({ iso: o.verzondenOp, tekst: `${o.id} (v${o.versie}) verstuurd` })
    if (o.geaccepteerdOp)
      uit.push({ iso: o.geaccepteerdOp, tekst: `${o.id} (v${o.versie}) geaccepteerd` })
  }
  if (p.opdrachtbevestiging?.verzondenOp)
    uit.push({
      iso: p.opdrachtbevestiging.verzondenOp,
      tekst: `${p.opdrachtbevestiging.id} verstuurd`,
    })
  for (const order of p.productieOrders) {
    for (const s of order.stappen) {
      if (s.gereedOp)
        uit.push({
          iso: s.gereedOp,
          tekst: `${order.id} — ${s.naam} gereed${s.gereedDoor ? ` door ${s.gereedDoor}` : ''}`,
        })
    }
  }
  for (const pl of p.paklijsten) {
    if (pl.verzondenOp)
      uit.push({ iso: pl.verzondenOp, tekst: `${pl.id} verzonden (${pl.regels.length} regels)` })
  }
  for (const f of p.facturen) {
    if (f.verzondenOp)
      uit.push({
        iso: f.verzondenOp,
        tekst: `${f.id} ${f.soort === 'credit' ? 'gecrediteerd' : 'verstuurd'} — ${eur(
          f.totaalInclBtw,
        )}`,
      })
  }
  uit.push({ iso: p.updatedAt, tekst: 'Project bijgewerkt' })

  return uit
    .sort((a, b) => b.iso.localeCompare(a.iso))
    .map((r) => ({ tijd: `${datumKort(r.iso)} ${tijdstip(r.iso)}`, tekst: r.tekst }))
}
