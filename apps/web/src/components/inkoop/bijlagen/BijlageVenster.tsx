import { createPortal } from 'react-dom'
import { IconExternalLink, IconX } from '@tabler/icons-react'
import type { InkoopBijlage } from '../../../api/inkoop-bijlagen'

/**
 * Een document van de leverancier bekijken zonder de pagina te verlaten. Via een
 * portal naar <body>: in het zijpaneel zou het venster anders in dat paneel
 * geklemd zitten.
 */
export function BijlageVenster({ bijlage, onSluit }: { bijlage: InkoopBijlage; onSluit: () => void }) {
  const beeld = /\.(png|jpe?g|gif|webp)$/i.test(bijlage.url)
  const pdf = /\.pdf$/i.test(bijlage.url)
  return createPortal(
    <div className="ibj-overlay" onClick={onSluit}>
      <div className="ibj-venster" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={bijlage.naam}>
        <div className="ibj-kop">
          <b>{bijlage.naam}</b>
          <span className="ib-sub" style={{ display: 'inline' }}>{bijlage.door ?? ''} · {bijlage.createdAt.slice(0, 10)}</span>
          <a className="st-btn sm" href={bijlage.url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}><IconExternalLink size={13} />Openen</a>
          <button type="button" className="st-icon-btn" onClick={onSluit} aria-label="Sluiten"><IconX size={16} /></button>
        </div>
        {pdf ? <iframe title={bijlage.naam} src={bijlage.url} className="ibj-pdf" />
          : beeld ? <img alt={bijlage.naam} src={bijlage.url} className="ibj-pdf" style={{ objectFit: 'contain' }} />
          : <div className="ib-sub" style={{ padding: 20 }}>Dit bestand is hier niet te tonen. Gebruik "Openen".</div>}
      </div>
    </div>,
    document.body,
  )
}
