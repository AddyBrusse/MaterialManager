import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { articlesApi, type Article, type ArticleEstimate, type ArticleInput } from '../api/articles'
import { ApiFout } from '../api/client'
import { toArticleMeta, type ArticleMeta } from '../components/articles/ArticleInfoStrip'
import { receptUitCalculatie } from '../components/articles/calc-helpers'
import { meldFout } from '../utils/fout-melding-toon'

const LEGE_CALCULATIE: ArticleEstimate = { marginPct: 35, nodes: [], updatedAt: '' }
const LEGE_META: ArticleMeta = {
  naam: '', relatieId: null, contactId: null, klant: '', tekening: '', rev: '',
  operations: [], currentStock: '', minStock: '', maxStock: '', locatie: '',
}

export type OpslagStand = 'stil' | 'bezig' | 'opgeslagen' | 'mislukt'

const tijd = (s: string) => Date.parse(s) || 0

function metaPatch(meta: ArticleMeta, naamNu: string): Partial<ArticleInput> {
  return {
    naam: meta.naam.trim() || naamNu,
    relatieId: meta.relatieId,
    contactId: meta.contactId,
    klant: meta.klant.trim() || null,
    tekening: meta.tekening.trim() || null,
    rev: meta.rev.trim() || null,
    operations: meta.operations.map((tp, i) => ({ id: `op_${i}_${tp}`, type: tp })),
    currentStock: Number(meta.currentStock) || 0,
    minStock: meta.minStock === '' ? null : Number(meta.minStock),
    maxStock: meta.maxStock === '' ? null : Number(meta.maxStock),
    locatie: meta.locatie.trim() || null,
  }
}

/**
 * Een artikel bewerken op de receptpagina (2026-10-23): lezen van de server,
 * vanzelf opslaan, en laten zien of dat gelukt is.
 *
 * - **Lezen** gaat naar de server, niet naar de kopie in de browser. Met die
 *   kopie bleef een direct geopend artikel de oude stand tonen, en ging die bij
 *   de volgende wijziging terug naar de server. Is de server niet bereikbaar,
 *   dan wél de kopie, maar gemeld en alleen om te lezen (`kopie`).
 * - **Opslaan** 0,4 s na de laatste wijziging, één verzoek tegelijk; wat er
 *   tijdens het opslaan bij kwam gaat er direct achteraan. Pas groen als de
 *   server het bevestigt. Mislukt het, dan blijft op het scherm staan wat je
 *   invulde (weggooien kost je werk) maar staat er rood "niet opgeslagen", met
 *   een melding en "Opnieuw opslaan".
 * - **Een nieuwere serverstand** (een collega, de nacalculatie) neemt het scherm
 *   alleen over als er hier niets onopgeslagen staat.
 * - **Weggaan** binnen die 0,4 s slaat meteen op; de pagina sluiten met iets
 *   onopgeslagens vraagt de browser eerst te bevestigen.
 */
export function useArtikelBewerken(id: string, heeftSlot: boolean) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['article', id],
    queryFn: () => articlesApi.haal(id),
    enabled: !!id,
    retry: 1,
    // Meekijken: elke 5 s, zodat je ziet wat de ander doet. Zelf bewerken:
    // af en toe, voor een wijziging van buiten (norm bijstellen).
    refetchInterval: heeftSlot ? 30_000 : 5_000,
  })
  const fout = query.error
  const nietGevonden = fout instanceof ApiFout && fout.status === 404
  const kopie = !!fout && !nietGevonden && !query.data ? articlesApi.get(id) : null
  const article: Article | null = query.data ?? kopie
  const kanBewerken = heeftSlot && !kopie

  const [meta, setMetaState] = useState<ArticleMeta>(LEGE_META)
  const [est, setEstState] = useState<ArticleEstimate>(LEGE_CALCULATIE)
  const [opslag, setOpslag] = useState<OpslagStand>('stil')
  const [opgeslagenOm, setOpgeslagenOm] = useState<Date | null>(null)

  const basis = useRef<{ id: string; updatedAt: string } | null>(null)
  const metaRef = useRef(meta)
  const estRef = useRef(est)
  /** De calculatie zoals hij op de server staat — om te zien of het laatste materiaal weg is. */
  const vorigeEst = useRef<ArticleEstimate | null>(null)
  const metaVuil = useRef(false)
  const estVuil = useRef(false)
  const versie = useRef(0)
  const bezig = useRef(false)
  const nogEens = useRef(false)
  const gemeld = useRef(false)
  const magBewaren = useRef(false)
  magBewaren.current = kanBewerken
  const meldingId = `artikel-opslaan-${id}`

  // Serverstand op het scherm: bij een ander artikel altijd, anders alleen als
  // hij nieuwer is en hier niets onopgeslagen staat.
  useEffect(() => {
    if (!article) return
    const b = basis.current
    if (b && b.id === article.id && (metaVuil.current || estVuil.current || tijd(article.updatedAt) <= tijd(b.updatedAt))) return
    const m = toArticleMeta(article)
    const e = article.estimate ?? LEGE_CALCULATIE
    metaRef.current = m; estRef.current = e; vorigeEst.current = article.estimate
    setMetaState(m); setEstState(e)
    basis.current = { id: article.id, updatedAt: article.updatedAt }
    metaVuil.current = false; estVuil.current = false
  }, [article])

  async function bewaar(): Promise<void> {
    const b = basis.current
    if (!b || (!metaVuil.current && !estVuil.current)) return
    if (bezig.current) { nogEens.current = true; return }
    const patch: Partial<ArticleInput> = {}
    if (metaVuil.current) Object.assign(patch, metaPatch(metaRef.current, article?.naam ?? ''))
    const estNu = estVuil.current ? estRef.current : null
    if (estNu) {
      patch.estimate = { ...estNu, updatedAt: new Date().toISOString() }
      const recept = receptUitCalculatie(estNu, vorigeEst.current)
      if (recept !== undefined) patch.recipe = recept
    }
    const versieNu = versie.current
    bezig.current = true
    setOpslag('bezig')
    try {
      const nieuw = await articlesApi.opslaan(b.id, patch)
      // Een peiling die nog onderweg was mag deze stand niet overschrijven.
      await qc.cancelQueries({ queryKey: ['article', b.id] })
      if (basis.current?.id === b.id) {
        basis.current = { id: b.id, updatedAt: nieuw.updatedAt }
        if (estNu) vorigeEst.current = estNu
        if (versie.current === versieNu) { metaVuil.current = false; estVuil.current = false }
      }
      qc.setQueryData(['article', b.id], nieuw)
      qc.invalidateQueries({ queryKey: ['articles'] })
      // Lukt het alsnog, dan hoort de rode melding er niet meer te staan.
      if (gemeld.current) notifications.hide(meldingId)
      gemeld.current = false
      // Kwam er tijdens het opslaan iets bij, dan gaat dat er direct achteraan.
      setOpslag(versie.current === versieNu ? 'opgeslagen' : 'bezig')
      setOpgeslagenOm(new Date())
    } catch (f) {
      setOpslag('mislukt')
      // Eén melding per reeks: wie doortypt terwijl de server weg is, krijgt
      // niet bij elke toets een nieuwe. De stand bovenaan blijft rood.
      if (!gemeld.current) {
        gemeld.current = true
        meldFout({
          id: meldingId,
          actie: 'Artikel opslaan',
          fout: f,
          gevolg: f instanceof ApiFout && f.code === 'TIMEOUT'
            ? 'Onbekend of je wijziging is opgeslagen: de server antwoordde niet op tijd. Op het scherm staat nog wat je invulde; klik bovenaan "Opnieuw opslaan".'
            : 'Je laatste wijziging staat niet op de server. Op het scherm staat nog wat je invulde; klik bovenaan "Opnieuw opslaan", of herlaad de pagina voor de serverstand.',
        })
      }
    } finally {
      bezig.current = false
      if (nogEens.current) { nogEens.current = false; void bewaar() }
    }
  }

  // Vanzelf opslaan, 0,4 s na de laatste wijziging.
  useEffect(() => {
    if (!kanBewerken || (!metaVuil.current && !estVuil.current)) return
    const t = setTimeout(() => { void bewaar() }, 400)
    return () => clearTimeout(t)
  }, [meta, est]) // eslint-disable-line react-hooks/exhaustive-deps

  // Weg van deze pagina (of naar een ander artikel) binnen de wachttijd: nu
  // opslaan, anders gaat de laatste wijziging verloren.
  const bewaarNu = useRef(bewaar)
  bewaarNu.current = bewaar
  useEffect(() => () => {
    if (magBewaren.current && (metaVuil.current || estVuil.current)) void bewaarNu.current()
  }, [id])

  // Tab of venster sluiten met iets wat nog niet op de server staat: de
  // browser vraagt het eerst.
  useEffect(() => {
    const voorSluiten = (e: BeforeUnloadEvent) => {
      if (!metaVuil.current && !estVuil.current && !bezig.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', voorSluiten)
    return () => window.removeEventListener('beforeunload', voorSluiten)
  }, [])

  // Zodra er iets gewijzigd is staat er "bezig", niet nog de vorige "opgeslagen".
  const wijzigt = () => setOpslag(s => s === 'mislukt' ? s : 'bezig')

  const setMeta = (patch: Partial<ArticleMeta>) => {
    wijzigt()
    metaVuil.current = true
    versie.current++
    metaRef.current = { ...metaRef.current, ...patch }
    setMetaState(metaRef.current)
  }
  const changeEst: Dispatch<SetStateAction<ArticleEstimate>> = update => {
    wijzigt()
    estVuil.current = true
    versie.current++
    estRef.current = typeof update === 'function' ? update(estRef.current) : update
    setEstState(estRef.current)
  }

  return {
    article, laden: query.isPending && !kopie, nietGevonden, kopie: !!kopie, kanBewerken,
    meta, setMeta, est, changeEst,
    opslag, opgeslagenOm, opnieuwOpslaan: () => { void bewaar() },
  }
}
