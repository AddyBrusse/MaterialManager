import type { ReactNode } from 'react'

interface Props {
  titel: string
  /** Teller rechts naast de kop, bv. "4 versies · 1 geaccepteerd". */
  teller?: string
  acties?: ReactNode
  /** Cursieve bronregel onder de kaart: waar deze cijfers vandaan komen. */
  bron?: string
  /** Zonder padding voor kaarten die een tabel over de volle breedte tonen. */
  plat?: boolean
  children: ReactNode
}

/** De kaartvorm uit §5 — kop, inhoud en optioneel een bronregel. */
export function Card({ titel, teller, acties, bron, plat, children }: Props) {
  return (
    <section className="pdv2-card">
      <div className="pdv2-card-head">
        <h2>{titel}</h2>
        {teller && <span className="pdv2-count">{teller}</span>}
        {acties && (
          <>
            <span className="pdv2-spacer" />
            {acties}
          </>
        )}
      </div>
      {plat ? children : <div className="pdv2-card-body">{children}</div>}
      {bron && <div className="pdv2-bron">{bron}</div>}
    </section>
  )
}
