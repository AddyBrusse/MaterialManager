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
import type { ProjectNacalculatie } from '../../../../api/nacalculatie'
import type { ZaagReservation } from '../../../../api/reservations'
import { houdtVast } from '../../../../api/reservations'
import type { FacetVM, GeldVM, ReserveringVM, TodoVM, ActiviteitVM, TabBadge, TabId } from '../types'
import { datum, datumKort, eur, pct, relatieveDagen, dagenTot, tijdstip } from './format'
import { geaccepteerdeOfferte, geldendeOfferte, ordersGereed, stapTelling } from './status'

const STATUS_LABEL: Record<Project['status'], string> = {
  concept: 'Concept',
  offerte: 'Offerte',
  bevestigd: 'Bevestigd',
  productie: 'Productie',
  paklijst: 'Paklijst',
  verzonden: 'Verzonden',
  gefactureerd: 'Gefactureerd',
  on_hold: 'On hold',
  geannuleerd: 'Geannuleerd',
}

export function statusLabel(s: Project['status']): string {
  return STATUS_LABEL[s]
}

export function offerteTotaal(p: Project): number | null {
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
    case 'productie':
      return 'door de eerste gereedmelding'
    case 'paklijst':
    case 'verzonden':
      return p.paklijst ? `door ${p.paklijst.id}` : ''
    case 'gefactureerd':
      return p.factuur ? `door ${p.factuur.id}` : ''
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
      label: 'Offertetotaal',
      waarde: totaalBedrag === null ? '—' : eur(totaalBedrag),
      sub: geldend
        ? `${geldend.id}${acc ? ` · v${acc.versie} geaccepteerd` : ` · v${geldend.versie}`}`
        : 'nog geen offerte',
    },
  ]

  // Facet 5 wisselt van betekenis zodra er een factuur is: daarna is de
  // vervaldatum het getal waar iemand naar zoekt, niet de levertijd.
  if (p.factuur) {
    const n = dagenTot(p.factuur.vervaldatum)
    facetten.push({
      label: 'Factuur',
      waarde: eur(p.factuur.totaalInclBtw),
      sub: p.factuur.vervaldatum
        ? `vervalt ${datumKort(p.factuur.vervaldatum)}`
        : 'geen vervaldatum',
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
        ? `${pct(afw)} ${afw !== null && afw < 0 ? 'onder' : 'boven'} calculatie`
        : `voorlopig · ${gemetenPosten(nacalc)} van ${nacalc.orders.length * 4} posten gemeten`,
    kleur: afw !== null && Math.abs(afw) >= 15 ? (afw > 0 ? 'dgr' : 'ok') : undefined,
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

export function bouwTabBadges(
  p: Project,
  nacalc: ProjectNacalculatie | null,
): Record<TabId, TabBadge | null> {
  const { gereed, totaal } = stapTelling(p.productieOrders)
  const acc = geaccepteerdeOfferte(p)
  const documenten = [geldendeOfferte(p), p.opdrachtbevestiging, p.paklijst, p.factuur].filter(
    Boolean,
  ).length
  const afw = nacalc?.verschilPct ?? null

  return {
    algemeen: null,
    offertes:
      p.offertes.length === 0
        ? { tekst: 'geen' }
        : {
            tekst: `${p.offertes.length}${acc ? ` · v${acc.versie} ✓` : ''}`,
            kleur: acc ? 'ok' : undefined,
          },
    opdracht: !p.opdrachtbevestiging
      ? { tekst: '—' }
      : p.opdrachtbevestiging.verzondenOp
        ? { tekst: 'verzonden', kleur: 'ok' }
        : { tekst: 'concept' },
    productie:
      totaal === 0
        ? { tekst: 'geen' }
        : {
            tekst: `${gereed} van ${totaal}`,
            kleur: gereed === totaal ? 'ok' : 'accent',
          },
    nacalculatie: !nacalc
      ? { tekst: '—' }
      : !nacalc.gemeten
        ? { tekst: 'voorlopig', kleur: 'warn' }
        : {
            tekst: pct(afw),
            kleur: afw !== null && Math.abs(afw) >= 15 ? 'dgr' : 'warn',
          },
    documenten: { tekst: `${documenten}/4` },
  }
}

export function bouwGeld(p: Project, nacalc: ProjectNacalculatie | null): GeldVM {
  const verkoop = offerteTotaal(p)
  return {
    offertetotaal: verkoop,
    kostprijsCalculatie: nacalc?.gecalculeerdTotaal ?? null,
    kostprijsWerkelijk: nacalc?.werkelijkTotaal ?? null,
    verschil: nacalc?.verschilTotaal ?? null,
    verschilPct: nacalc?.verschilPct ?? null,
    margeWerkelijkPct: nacalc?.margeWerkelijkPct ?? null,
    margeCalculatiePct: nacalc?.margeGecalculeerdPct ?? null,
    notitie: p.factuur
      ? `Factuur incl. ${p.factuur.btwPct} % btw: ${eur(
          p.factuur.totaalInclBtw,
        )} — of de factuur betaald is, weet dit scherm niet.`
      : null,
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
  if (p.paklijst?.verzondenOp)
    uit.push({ iso: p.paklijst.verzondenOp, tekst: `${p.paklijst.id} verzonden` })
  if (p.factuur?.verzondenOp)
    uit.push({ iso: p.factuur.verzondenOp, tekst: `${p.factuur.id} verstuurd` })
  uit.push({ iso: p.updatedAt, tekst: 'Project bijgewerkt' })

  return uit
    .sort((a, b) => b.iso.localeCompare(a.iso))
    .slice(0, 8)
    .map((r) => ({ tijd: `${datumKort(r.iso)} ${tijdstip(r.iso)}`, tekst: r.tekst }))
}
