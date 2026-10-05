import { basisRegels, type Project, type Relatie } from '@stockmanager/shared'
import { articlesApi, type Article } from '../../../../api/articles'
import { gradesApi } from '../../../../api/grades'
import { relatiesApi } from '../../../../api/relaties'
import type { DocPartij, PrijsRegel } from '../../../../services/document/documenten'

/**
 * Wat elk document van een project nodig heeft en niet zelf weet: de klant,
 * zijn adressen, en per regel het artikel met materiaal en tekening.
 * Eén plek, zodat offerte, opdracht, factuur en pakbon hetzelfde zeggen.
 */

export function klantVan(p: Project) {
  const relatie = p.relatieId ? relatiesApi.listSync().find((r) => r.id === p.relatieId) ?? null : null
  const contact = relatie?.contacten.find((c) => c.id === p.contactId) ?? null
  return { relatie, contact }
}

/** Contactpersoon en e-mail onder de klantnaam — offerte en opdracht. */
export function klantPartij(p: Project): DocPartij {
  const { relatie, contact } = klantVan(p)
  return {
    naam: relatie?.naam ?? p.naam,
    regels: [contact?.naam, contact?.email || relatie?.email].filter((x): x is string => Boolean(x)),
  }
}

function adresRegels(straat?: string | null, pc?: string | null, stad?: string | null, land?: string | null): string[] {
  return [straat, [pc, stad].filter(Boolean).join(' '), land && land !== 'Nederland' ? land : null].filter(
    (x): x is string => Boolean(x),
  )
}

/** Het factuuradres: apart ingevuld bij de klant, anders het vestigingsadres. */
export function factuurAdres(r: Relatie | null): string[] {
  if (!r) return []
  return r.factuurAdresZelfde === false
    ? adresRegels(r.factuurStraat, r.factuurPostcode, r.factuurStad, r.factuurLand)
    : adresRegels(r.straat, r.postcode, r.stad, r.land)
}

/** Het afleveradres: apart ingevuld bij de klant, anders het vestigingsadres. */
export function afleverAdres(r: Relatie | null): string[] {
  if (!r) return []
  return r.afleverAdresZelfde === false
    ? adresRegels(r.afleverStraat, r.afleverPostcode, r.afleverStad, r.afleverLand)
    : adresRegels(r.straat, r.postcode, r.stad, r.land)
}

/** Het artikel achter een orderregel; pakbon- en factuurregels dragen alleen dat id. */
export function artikelVanRegel(project: Project, offerteRegelId: string | null | undefined): Article | null {
  if (!offerteRegelId) return null
  const id = basisRegels(project).find((r) => r.id === offerteRegelId)?.artikelId
  return id ? articlesApi.get(id) : null
}

/** De kwaliteit uit de artikelcalculatie ("S355", "304 RVS"); leeg zonder calculatie. */
export function materiaalVan(artikel: Article | null): string {
  const gradeId = artikel?.recipe?.gradeId
  if (!gradeId) return ''
  return gradesApi.listSync().find((g) => g.id === gradeId)?.name ?? ''
}

/** De tweede regel onder de naam: omschrijving en tekening met revisie. */
export function notitieVan(omschrijving: string | null | undefined, artikel: Article | null): string | null {
  const tekening = artikel?.tekening ? `tek. ${artikel.tekening}${artikel.rev ? ` rev. ${artikel.rev}` : ''}` : null
  const delen = [omschrijving?.trim() || null, tekening].filter(Boolean)
  return delen.length ? delen.join(' · ') : null
}

/** Een offerte- of opdrachtregel als documentregel. */
export function prijsRegel(r: {
  artikelId: string | null
  naam: string
  omschrijving: string
  qty: number
  eenheid: string
  verkoopprijs: number
  totaal: number
}): PrijsRegel {
  const artikel = r.artikelId ? articlesApi.get(r.artikelId) : null
  return {
    naam: r.naam,
    notitie: notitieVan(r.omschrijving, artikel),
    materiaal: materiaalVan(artikel),
    qty: r.qty,
    eenheid: r.eenheid,
    prijs: r.verkoopprijs,
    totaal: r.totaal,
  }
}
