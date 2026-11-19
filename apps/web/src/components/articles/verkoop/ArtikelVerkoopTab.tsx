import { PrijsafsprakenKaart } from './PrijsafsprakenKaart'
import { ArtikelVoorraadKaart } from './ArtikelVoorraadKaart'
import './artikel-verkoop.css'

/** Tab "Prijs & voorraad" (2026-11-18): wat de klant betaalt en wat er ligt om direct te leveren. */
export function ArtikelVerkoopTab({ artikelId, klantNaam, alleenLezen }: {
  artikelId: string
  klantNaam: string | null
  alleenLezen: boolean
}) {
  return (
    <div className="ph-wrap">
      <PrijsafsprakenKaart artikelId={artikelId} klantNaam={klantNaam} alleenLezen={alleenLezen} />
      <ArtikelVoorraadKaart artikelId={artikelId} alleenLezen={alleenLezen} />
    </div>
  )
}
