import type { FacetVM } from '../types'

/**
 * De zes kopfacetten (§3.1). Elk facet heeft een linkerscheidingslijn behalve
 * de eerste; in de popout vallen die per rij van drie weg (zie de @media in
 * project-detail.css).
 */
export function HeaderFacets({ facetten }: { facetten: FacetVM[] }) {
  return (
    <div className="pdv2-facets">
      {facetten.map((f) => (
        <div className="pdv2-facet" key={f.label}>
          <div className="pdv2-facet-label">{f.label}</div>
          <div className={`pdv2-facet-val ${f.kleur ?? ''}`} title={f.waarde}>
            {f.waarde}
          </div>
          {f.meter && (
            <div className="pdv2-meter">
              <i
                className={f.meter.gereed ? 'ok' : ''}
                style={{ width: `${Math.round(f.meter.deel * 100)}%` }}
              />
            </div>
          )}
          {f.sub && (
            <div className="pdv2-facet-sub" title={f.sub}>
              {f.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
