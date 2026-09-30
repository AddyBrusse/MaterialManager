import type { ProductieOrder, Project } from '../schemas/project'

/**
 * Voorbereiding en vrijgeven (besloten 2026-09-30).
 *
 * Accepteren maakt de productieorders aan in `voorbereiding`: nog niet in de
 * wachtrij, de planning of op de terminal. Kantoor kijkt eerst materiaal,
 * tekening en programma na, en geeft dan per order vrij. Zonder die stap stond
 * werk in de hal vóór iemand had gekeken of het klaar was om te maken — en kon
 * een operator beginnen aan iets wat de klant nog aanpaste.
 *
 * Web en server gebruiken dezelfde functies: het scherm vraagt `waaromNiet…`
 * vóór de handeling, de server nog eens en antwoordt `409 VOORWAARDE`.
 */

const heeftVoortgang = (o: ProductieOrder) => o.aantalGereed > 0 || o.stappen.some(s => s.gereedOp)

/** Orders die in de hal staan: vrijgegeven, en niet gestopt. */
export function isVrijgegeven(o: ProductieOrder): boolean {
  return o.status !== 'voorbereiding' && o.status !== 'gestopt'
}

export function waaromNietVrijgeven(p: Project, orderIds: string[]): string | null {
  if (orderIds.length === 0) return 'Vink eerst aan welke orders in productie mogen.'
  for (const id of orderIds) {
    const o = p.productieOrders.find(x => x.id === id)
    if (!o) return `Order ${id} bestaat niet (meer). Ververs de pagina.`
    if (o.status !== 'voorbereiding') return `Order ${id} is al vrijgegeven.`
  }
  return null
}

/**
 * Wat de gebruiker vóór het vrijgeven moet weten. Blokkeert niets (principe van
 * 2026-09-28): het zijn zinnen voor een bevestiging, daarna mag het toch.
 *
 * @param zonderMateriaal de namen van regels waarvoor nog een todo "materiaal
 *   kiezen" openstaat — todo's zitten niet in het project, dus die geeft de
 *   aanroeper mee.
 */
export function waarschuwingenBijVrijgeven(p: Project, zonderMateriaal: string[]): string[] {
  const uit: string[] = []
  if (!p.opdrachtbevestiging?.verzondenOp) {
    uit.push('De opdrachtbevestiging is nog niet naar de klant verstuurd.')
  }
  if (zonderMateriaal.length === 1) uit.push(`Voor "${zonderMateriaal[0]}" is nog geen materiaal gekozen.`)
  if (zonderMateriaal.length > 1) {
    uit.push(`Voor ${zonderMateriaal.map(n => `"${n}"`).join(', ')} is nog geen materiaal gekozen.`)
  }
  return uit
}

/** Zet de orders in de hal. Het project gaat naar Productie zodra er één vrij is. */
export function vrijgeven(p: Project, orderIds: string[], nu: string): Project {
  const ids = new Set(orderIds)
  const productieOrders = p.productieOrders.map(o =>
    ids.has(o.id) && o.status === 'voorbereiding' ? { ...o, status: 'gepland' as const, updatedAt: nu } : o,
  )
  return {
    ...p,
    productieOrders,
    status: p.status === 'bevestigd' ? 'productie' : p.status,
    updatedAt: nu,
  }
}

export function waaromNietTerugNaarVoorbereiding(p: Project, orderIds: string[]): string | null {
  if (orderIds.length === 0) return 'Kies eerst welke orders terug moeten.'
  for (const id of orderIds) {
    const o = p.productieOrders.find(x => x.id === id)
    if (!o) return `Order ${id} bestaat niet (meer). Ververs de pagina.`
    if (o.status === 'voorbereiding') return `Order ${id} staat al in voorbereiding.`
    if (o.status === 'gestopt') return `Order ${id} is gestopt; die gaat niet terug naar voorbereiding.`
    if (heeftVoortgang(o)) {
      return `Aan order ${id} is al gewerkt. Trek de gereedmeldingen eerst in op de Productie-tab, ` +
        'of pas het aantal aan op de Opdracht-tab.'
    }
  }
  return null
}

/**
 * Haalt de orders uit de hal. Staat er daarna niets meer vrij, dan is het
 * project weer Bevestigd: er wordt niets gemaakt.
 */
export function terugNaarVoorbereiding(p: Project, orderIds: string[], nu: string): Project {
  const ids = new Set(orderIds)
  const productieOrders = p.productieOrders.map(o =>
    ids.has(o.id) ? { ...o, status: 'voorbereiding' as const, updatedAt: nu } : o,
  )
  const nogVrij = productieOrders.some(isVrijgegeven)
  return {
    ...p,
    productieOrders,
    status: p.status === 'productie' && !nogVrij ? 'bevestigd' : p.status,
    updatedAt: nu,
  }
}

/**
 * De status van een order na het (af)vinken van stappen. Een order in
 * voorbereiding waarop toch iets wordt afgevinkt, is kennelijk in de hal: dan
 * geldt hij als vrijgegeven. Een gestopte order blijft gestopt.
 */
export function orderStatusNaStappen(o: ProductieOrder, stappen: ProductieOrder['stappen']): ProductieOrder['status'] {
  if (o.status === 'gestopt') return 'gestopt'
  if (stappen.every(s => s.gereedOp)) return 'gereed'
  if (stappen.some(s => s.gereedOp)) return 'in_productie'
  return o.status === 'voorbereiding' ? 'voorbereiding' : 'gepland'
}
