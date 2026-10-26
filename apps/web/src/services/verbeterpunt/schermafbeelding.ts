import { createContext, destroyContext, domToBlob } from 'modern-screenshot'
import { lijnDikte, type Kader } from '../../utils/verbeterpunt'

/**
 * De schermafbeelding bij "Dit klopt niet" (2026-10-24).
 *
 * Geen echte schermafdruk: die (getDisplayMedia) staat de browser alleen toe op
 * https of localhost, en de app draait via http op het netwerk. Dit tekent de
 * pagina na zoals hij nu staat. Wat daarbij standaard misging, gemeten op
 * 2026-10-23/24, en hier is rechtgezet:
 *
 * - een gescrolde lijst kwam bovenaan in beeld → `restoreScrollPosition`
 * - de kop van zo'n lijst (sticky) schoof dan mee naar boven, uit beeld → zijn
 *   plek op het scherm wordt gemeten en op de kopie teruggezet
 * - lettertypes van Google kon hij niet insluiten → ze staan nu in de app zelf
 *   (`@fontsource`, main.tsx)
 * - een lege invoer toonde zijn hulptekst (placeholder) als zwarte tekst → de
 *   grijstint gaat per veld mee
 * - waar de browser zwevende schuifbalken heeft, kreeg de kopie vaste die ruimte
 *   innamen (de zijbalk werd 15 px korter) → daar krijgt de kopie er geen
 * - een keuzelijst toonde altijd de eerste keuze, een vinkje stond nooit aan en
 *   getypte tekst in een groot tekstvak ontbrak → de stand gaat per veld mee
 *
 * Wat er dan nog af kan wijken (een 3D-model, een pdf in een frame) dekt de
 * gebruiker af door er een eigen schermafdruk overheen te plakken.
 *
 * Snelheid (gemeten 2026-10-26): het werk groeit met het aantal elementen. Een
 * lijst van 60 relaties kostte 12 s, waarvan 5 s aan één stuk: typen in het
 * venster bleef dan hangen. Twee derde van de afbeelding bestond uit
 * CSS-variabelen (`--mantine-…`): die erft elk element, en de bibliotheek
 * schreef ze bij elk element uit. De kopie heeft ze niet nodig, want de waarden
 * zijn dan al ingevuld; ze gaan er nu uit. Verder slaat hij tabelregels onder
 * het scherm over (onzichtbaar, maar veel werk) en geeft hij de browser
 * tussendoor de beurt.
 */

/** Elementen met dit attribuut komen niet op de afbeelding: het venster van het verbeterpunt zelf. */
export const NIET_OP_SCHERMAFBEELDING = 'data-niet-op-schermafbeelding'

/** Tijdelijke markering op de echte pagina; de kopie erft hem, en daarna gaat hij eraf. */
const MERK = 'data-sa'
export const KADER_KLEUR = '#e03131'

interface Voorbereiding {
  /** Extra stijlregels voor de kopie. */
  css: string[]
  /** Per gemarkeerd element wat er op de kopie nog moet gebeuren. */
  acties: Map<string, ((kopie: HTMLElement) => void)[]>
  /** Tabelregels helemaal onder het scherm: die komen niet in de kopie. */
  onderScherm: Set<Element>
  opruimen: () => void
}

/** Eén ronde over de pagina: alles wat het natekenen zelf niet goed doet, vastleggen. */
function bereidVoor(): Voorbereiding {
  const css: string[] = []
  const acties = new Map<string, ((kopie: HTMLElement) => void)[]>()
  const gemerkt: HTMLElement[] = []
  // Eén nummer per element, ook als het om meer dan één reden gemerkt wordt.
  const merk = (el: HTMLElement) => {
    if (!el.hasAttribute(MERK)) { el.setAttribute(MERK, String(gemerkt.length)); gemerkt.push(el) }
    return `[${MERK}="${el.getAttribute(MERK)}"]`
  }
  const opKopie = (el: HTMLElement, actie: (kopie: HTMLElement) => void) => {
    const sleutel = merk(el)
    acties.set(sleutel, [...(acties.get(sleutel) ?? []), actie])
  }
  const sticky: HTMLElement[] = []

  for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
    const stijl = getComputedStyle(el)
    if (stijl.position === 'sticky') sticky.push(el)
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.placeholder && !el.value) {
      // Ook -webkit-text-fill-color: die neemt de kopie over van het veld zelf
      // (de tekstkleur), en die wint van `color` — dan blijft het zwart.
      const kleur = getComputedStyle(el, '::placeholder').color
      css.push(`${merk(el)}::placeholder{color:${kleur}!important;-webkit-text-fill-color:${kleur}!important;opacity:1!important}`)
    }
    // De stand van een veld staat in een eigenschap, niet in de html; de kopie
    // neemt alleen de html over.
    if (el instanceof HTMLSelectElement) {
      const gekozen = [...el.options].map((o) => o.selected)
      opKopie(el, (k) => [...(k as HTMLSelectElement).options].forEach((o, i) => o.toggleAttribute('selected', gekozen[i])))
    } else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      const aan = el.checked
      opKopie(el, (k) => k.toggleAttribute('checked', aan))
    } else if (el instanceof HTMLTextAreaElement) {
      const tekst = el.value
      opKopie(el, (k) => { k.textContent = tekst })
    }
    const schuift = /(auto|scroll)/.test(stijl.overflowX + stijl.overflowY)
    if (schuift && el.offsetWidth - el.clientWidth - parseFloat(stijl.borderLeftWidth) - parseFloat(stijl.borderRightWidth) < 1
      && el.offsetHeight - el.clientHeight - parseFloat(stijl.borderTopWidth) - parseFloat(stijl.borderBottomWidth) < 1) {
      css.push(`${merk(el)}{scrollbar-width:none!important}`)
    }
  }

  // Sticky: de plek op het scherm tegenover de gewone plek. Eén keer alles
  // tegelijk naar de gewone plek, meten en terug — binnen één taak, dus de
  // gebruiker ziet er niets van.
  const opScherm = sticky.map((el) => el.getBoundingClientRect())
  const oud = sticky.map((el) => [el.style.getPropertyValue('position'), el.style.getPropertyPriority('position')])
  sticky.forEach((el) => el.style.setProperty('position', 'static', 'important'))
  const gewoon = sticky.map((el) => el.getBoundingClientRect())
  sticky.forEach((el, i) => (oud[i][0] ? el.style.setProperty('position', oud[i][0], oud[i][1]) : el.style.removeProperty('position')))
  const verschil = new Map(sticky.map((el, i) => [el, { x: opScherm[i].left - gewoon[i].left, y: opScherm[i].top - gewoon[i].top }]))
  for (const [el, v] of verschil) {
    // Binnen een ander sticky element telt alleen het eigen deel; dat van de
    // ouder verschuift de ouder zelf al.
    let o = el.parentElement
    while (o && !verschil.has(o)) o = o.parentElement
    const x = v.x - (o ? verschil.get(o)!.x : 0)
    const y = v.y - (o ? verschil.get(o)!.y : 0)
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue
    opKopie(el, (k) => {
      k.style.setProperty('position', 'relative', 'important')
      k.style.setProperty('left', `${x}px`, 'important')
      k.style.setProperty('top', `${y}px`, 'important')
      k.style.setProperty('right', 'auto', 'important')
      k.style.setProperty('bottom', 'auto', 'important')
    })
  }

  // Een regel eronder weglaten schuift niets wat in beeld staat, en de kolommen
  // houden hun breedte: die neemt de kopie per cel over van de echte pagina.
  // De hoogte van de tabel niet: die rekt de overgebleven regels anders op.
  const onderScherm = new Set<Element>()
  for (const tbody of document.querySelectorAll('tbody')) {
    const rijen = [...tbody.children]
    const vanaf = rijen.findIndex((r) => r.getBoundingClientRect().top >= window.innerHeight)
    if (vanaf < 0) continue
    rijen.slice(vanaf).forEach((r) => onderScherm.add(r))
    for (const el of [tbody, tbody.closest('table')]) {
      if (el instanceof HTMLElement) opKopie(el, (k) => k.style.setProperty('height', 'auto', 'important'))
    }
  }

  return { css, acties, onderScherm, opruimen: () => gemerkt.forEach((el) => el.removeAttribute(MERK)) }
}

/**
 * Het hulpframe waarin de bibliotheek de standaardstijl per soort element
 * opvraagt. De bibliotheek maakt het zelf pas tijdens het natekenen, en het
 * laadt los: zodra de browser tussendoor de beurt krijgt (`gunBeurt`), vervangt
 * hij het halverwege door een leeg document en faalt alles erna. Dus nu vooraf,
 * en pas verder als het geladen is.
 */
async function zandbak(): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe')
  frame.width = '0'
  frame.height = '0'
  frame.style.visibility = 'hidden'
  frame.style.position = 'fixed'
  frame.setAttribute(NIET_OP_SCHERMAFBEELDING, '')
  const geladen = new Promise((ok) => frame.addEventListener('load', ok, { once: true }))
  frame.srcdoc = '<!DOCTYPE html><meta charset="UTF-8"><title></title><body>'
  document.body.appendChild(frame)
  await geladen
  return frame
}

/** Om de ~12 ms even de browser laten: dan reageert het venster op typen. */
function gunBeurt(): () => Promise<void> {
  let sinds = performance.now()
  return async () => {
    if (performance.now() - sinds < 12) return
    await new Promise((ok) => setTimeout(ok, 0))
    sinds = performance.now()
  }
}

function pasToe(kloon: Element, v: Voorbereiding): void {
  for (const [sleutel, lijst] of v.acties) {
    const el = kloon.querySelector<HTMLElement>(sleutel)
    if (el) lijst.forEach((actie) => actie(el))
  }
  if (!v.css.length) return
  const stijl = document.createElement('style')
  stijl.textContent = v.css.join('\n')
  kloon.appendChild(stijl)
}

export async function maakSchermafbeelding(): Promise<Blob> {
  const sandbox = await zandbak()
  const v = bereidVoor()
  let context: Awaited<ReturnType<typeof createContext>> | undefined
  try {
    context = await createContext(document.documentElement, {
      width: window.innerWidth,
      height: window.innerHeight,
      // Scherp op een scherm met 125 of 150 %, maar niet groter dan nodig.
      scale: Math.min(window.devicePixelRatio || 1, 2),
      type: 'image/png',
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      timeout: 10_000,
      features: { restoreScrollPosition: true },
      // Alle gewone eigenschappen, zonder de CSS-variabelen
      includeStyleProperties: [...getComputedStyle(document.documentElement)].filter((n) => !n.startsWith('--')),
      filter: (n) => !(n instanceof Element && (n.hasAttribute(NIET_OP_SCHERMAFBEELDING) || v.onderScherm.has(n))),
      onCloneEachNode: gunBeurt(),
      onCloneNode: (kloon) => { if (kloon instanceof Element) pasToe(kloon, v) },
    })
    context.sandbox = sandbox
    return await domToBlob(context)
  } finally {
    v.opruimen()
    if (context) destroyContext(context)
    sandbox.remove()
  }
}

/** De afbeelding met de getekende kaders erin gebrand, als png. */
export async function metKaders(beeld: Blob, kaders: Kader[]): Promise<Blob> {
  if (!kaders.length) return beeld
  const bitmap = await createImageBitmap(beeld)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('De browser kan hier niet tekenen, dus de kaders konden niet op de afbeelding')
  ctx.drawImage(bitmap, 0, 0)
  ctx.strokeStyle = KADER_KLEUR
  ctx.lineWidth = lijnDikte(bitmap.width)
  for (const k of kaders) ctx.strokeRect(k.x * bitmap.width, k.y * bitmap.height, k.b * bitmap.width, k.h * bitmap.height)
  return new Promise((ok, nee) => canvas.toBlob(
    (b) => (b ? ok(b) : nee(new Error('De afbeelding met kaders kon niet gemaakt worden'))),
    'image/png',
  ))
}
