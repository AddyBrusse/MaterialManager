import { useNavigate } from 'react-router-dom'
import type { OfferteRegel } from '@stockmanager/shared'
import type { Article } from '../../../../api/articles'
import { ArtikelPreviewThumb } from '../../../../components/projecten/ArtikelPreviewThumb'
import { buildEstimateCtx, computeEstimateTotals, laderVoorRegel, materiaalBehoefte, nettoLengte } from '../../../../api/estimate'
import { stangenTekst } from '../../../../api/materiaal-plan'
import { gradesApi } from '../../../../api/grades'
import { profilesApi } from '../../../../api/profiles'
import { machinesApi } from '../../../../api/machines'
import { eur } from '../lib/format'

/**
 * De cellen van een offerteregel die uit het artikel komen, niet uit de regel.
 *
 * Een regel draagt alleen `artikelId`; tekening, revisie en bestanden staan op
 * het artikel. Ze stonden in de oude offertetabel en zijn bij de herindeling
 * weggevallen — dit zet ze terug.
 */

/** Voorbeeld: STEP-render als die er is, anders de pdf-tekening. Bij hover
 *  een groter beeld, en bij een STEP een draaibaar 3D-model. */
export function VoorbeeldCel({ artikel, size = 72 }: { artikel: Article | null; size?: number }) {
  return (
    <td className="pdv2-voorbeeld">
      <ArtikelPreviewThumb article={artikel} size={size} />
    </td>
  )
}

export { artikelVanRegel } from '../lib/document-gegevens'

/** Naam, omschrijving, en het artikelnummer als weg naar het artikel zelf —
 *  daar pas je de calculatie of de tekening aan. `returnTo` brengt je daarna
 *  terug naar dit project, dezelfde afspraak als de artikelkiezer. */
export function ArtikelCel({ regel, projectId }: { regel: OfferteRegel; projectId: string }) {
  const navigate = useNavigate()
  return (
    <td>
      <span style={{ fontWeight: 600 }}>{regel.naam}</span>
      <span className="sub">
        {regel.artikelId && (
          <a
            className="mono"
            href={`/artikelen/${regel.artikelId}`}
            title={`Artikel ${regel.artikelId} openen`}
            onClick={(e) => {
              e.preventDefault()
              navigate(`/artikelen/${regel.artikelId}?returnTo=/projecten/${projectId}`)
            }}
          >
            {regel.artikelId}
          </a>
        )}
        {regel.artikelId && regel.omschrijving && ' · '}
        {regel.omschrijving}
      </span>
    </td>
  )
}

/** Het tekeningnummer van de klant met de revisie eronder — het nummer waarmee
 *  de klant het onderdeel kent, en dus waarop hij de offerte naleest. */
export function TekeningCel({ artikel }: { artikel: Article | null }) {
  if (!artikel?.tekening) return <td style={{ color: 'var(--text3)' }}>—</td>
  return (
    <td>
      <span className="mono">{artikel.tekening}</span>
      {artikel.rev && <span className="sub">rev {artikel.rev}</span>}
    </td>
  )
}

/**
 * Kostprijs per stuk bij dít aantal, uit de artikelcalculatie. Het aantal doet
 * ertoe: de insteltijd wordt over de stuks verdeeld, dus bij 40 stuks is een
 * stuk goedkoper dan bij 5. Geen calculatie, dan geen kostprijs — niet € 0.
 */
function kostprijsPerStuk(artikel: Article | null, qty: number): number | null {
  if (!artikel?.estimate) return null
  try {
    const ctx = buildEstimateCtx(artikel, gradesApi.listSync(), profilesApi.listSync(), machinesApi.listSync())
    const kost = computeEstimateTotals(artikel.estimate, ctx, qty).cost
    return kost > 0 ? kost : null
  } catch {
    return null
  }
}

/** "Materiaal: 3 × 1.086 + 4 × 998 mm (7.271 mm, lader Mazak)" — wat er bij dit aantal gezaagd wordt (2026-10-09). */
function materiaalTekst(artikel: Article | null, qty: number): string {
  const regel = artikel?.estimate?.nodes.find((n) => n.type === 'material' && !n.exoot)
  if (!artikel || !regel) return ''
  const ctx = buildEstimateCtx(artikel, gradesApi.listSync(), profilesApi.listSync(), machinesApi.listSync())
  const lader = laderVoorRegel(regel, ctx.machines)
  const b = materiaalBehoefte(nettoLengte(regel, ctx), lader, qty)
  if (!b.totaalMm) return ''
  const lengtes = lader ? `${b.stangen.length} laderstangen: ${stangenTekst(b.stangen)}` : `${qty} × ${b.stukMm} mm`
  return `\nMateriaal: ${lengtes} — ${Math.round(b.totaalMm).toLocaleString('nl-NL')} mm te zagen${lader ? ` (lader ${lader.machineNaam})` : ''}`
}

/**
 * Marge per regel, als opslag op de kostprijs — dezelfde definitie als
 * `marginPct` in de rekenkern en als de oude offertetabel.
 *
 * Rekent met het aantal op de regel. Zet je een staffel van 5 op 40 stuks en
 * laat je de prijs staan, dan zie je de marge hier oplopen: dat is het signaal
 * om "Prijzen bijwerken" te doen, zonder dat er iets vanzelf verandert.
 */
export function MargeCel({ artikel, regel }: { artikel: Article | null; regel: OfferteRegel }) {
  const kost = kostprijsPerStuk(artikel, regel.qty || 1)
  if (kost === null) {
    return (
      <td className="num" style={{ color: 'var(--text3)' }} title="Geen calculatie op dit artikel">
        —
      </td>
    )
  }
  const marge = Math.round((regel.verkoopprijs / kost - 1) * 100)
  return (
    <td
      className="num"
      style={marge < 0 ? { color: 'var(--dgr)', fontWeight: 600 } : undefined}
      title={`Kostprijs ${eur(kost)} per stuk bij ${regel.qty} ${regel.eenheid}${materiaalTekst(artikel, regel.qty || 1)}`}
    >
      {marge}%
    </td>
  )
}
