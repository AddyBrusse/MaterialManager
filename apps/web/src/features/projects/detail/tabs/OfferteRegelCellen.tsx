import { useNavigate } from 'react-router-dom'
import type { OfferteRegel } from '@stockmanager/shared'
import type { Article } from '../../../../api/articles'
import { ArtikelPreviewThumb } from '../../../../components/projecten/ArtikelPreviewThumb'

/**
 * De cellen van een offerteregel die uit het artikel komen, niet uit de regel.
 *
 * Een regel draagt alleen `artikelId`; tekening, revisie en bestanden staan op
 * het artikel. Ze stonden in de oude offertetabel en zijn bij de herindeling
 * weggevallen — dit zet ze terug.
 */

/** Voorbeeld: STEP-render als die er is, anders de pdf-tekening. Bij hover
 *  een groter beeld, en bij een STEP een draaibaar 3D-model. */
export function VoorbeeldCel({ artikel }: { artikel: Article | null }) {
  return (
    <td className="pdv2-voorbeeld">
      <ArtikelPreviewThumb article={artikel} size={72} />
    </td>
  )
}

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
