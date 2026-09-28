import type { ObInhoud, Project } from '../schemas/project'

/**
 * De opdrachtbevestiging: wat er verstuurd mag worden, en wat er veranderd is
 * sinds de klant hem kreeg.
 *
 * In `shared` om dezelfde reden als `offerte-voorwaarden`: scherm en server
 * moeten dezelfde regel toepassen en dezelfde zin tonen.
 */

/** Waarom de opdrachtbevestiging niet verstuurd kan worden; `null` = het mag. */
export function waaromNietVersturenOB(p: Project): string | null {
  const ob = p.opdrachtbevestiging
  if (!ob) {
    return 'Kan opdrachtbevestiging niet versturen: er is nog geen opdracht. Die ontstaat bij het accepteren van een offerte.'
  }
  if (ob.regels.length === 0) {
    return 'Kan opdrachtbevestiging niet versturen: er staan geen regels in de opdracht.'
  }
  // Afgesproken 2026-09-28: wat de klant als opdracht stuurt wisselt — een
  // inkooporder, een mail, een appje "maken!" — maar het moet terug te vinden
  // zijn. Daarom verplicht, en vrije tekst.
  if (!ob.opdrachtRef?.trim()) {
    return 'Kan opdrachtbevestiging niet versturen zonder opdrachtreferentie. Vul in waarmee de klant '
      + 'opdracht gaf: een inkoopnummer, of bijvoorbeeld "WhatsApp J. Prins 12-09".'
  }
  return null
}

/** Wat er nu op de opdrachtbevestiging staat, in de vorm van het verzendlogboek. */
export function obInhoud(p: Project): ObInhoud | null {
  const ob = p.opdrachtbevestiging
  if (!ob) return null
  return {
    levertijd: p.levertijdDatum,
    opdrachtRef: ob.opdrachtRef?.trim() || null,
    notities: ob.notities.trim(),
    regels: ob.regels.map(r => ({ id: r.id, naam: r.naam, qty: r.qty, verkoopprijs: r.verkoopprijs })),
  }
}

function datum(iso: string | null): string {
  if (!iso) return 'geen'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

function bedrag(n: number): string {
  return `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Wat er verschilt tussen wat de klant kreeg (`klant`) en wat er nu staat.
 * Eén zin per verschil, in de vorm "wat de klant heeft → wat het nu is", zodat
 * je ziet of opnieuw versturen nodig is. Leeg = de klant heeft de actuele stand.
 */
export function obWijzigingen(klant: ObInhoud, nu: ObInhoud): string[] {
  const uit: string[] = []
  if (datum(klant.levertijd) !== datum(nu.levertijd)) {
    uit.push(`Levertijd: klant heeft ${datum(klant.levertijd)}, nu ${datum(nu.levertijd)}`)
  }
  if ((klant.opdrachtRef ?? '') !== (nu.opdrachtRef ?? '')) {
    uit.push(`Opdrachtreferentie: klant heeft "${klant.opdrachtRef ?? ''}", nu "${nu.opdrachtRef ?? ''}"`)
  }
  if (klant.notities !== nu.notities) uit.push('Opmerking voor de klant is gewijzigd')

  const oud = new Map(klant.regels.map(r => [r.id, r]))
  for (const r of nu.regels) {
    const was = oud.get(r.id)
    if (!was) {
      uit.push(`Regel "${r.naam}" toegevoegd`)
      continue
    }
    if (was.qty !== r.qty) uit.push(`"${r.naam}": aantal ${was.qty} → ${r.qty}`)
    if (was.verkoopprijs !== r.verkoopprijs) {
      uit.push(`"${r.naam}": prijs ${bedrag(was.verkoopprijs)} → ${bedrag(r.verkoopprijs)}`)
    }
    oud.delete(r.id)
  }
  for (const r of oud.values()) uit.push(`Regel "${r.naam}" verwijderd`)
  return uit
}
