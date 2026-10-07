import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Popover } from '@mantine/core'
import { IconBell } from '@tabler/icons-react'
import { inkoopApi } from '../../../api/inkoop'
import './overzicht.css'

/** Wat er vandaag in de inkoop moet gebeuren (2026-10-07): ververst elke 30 s, net als de andere tellers. */
export function useInkoopMeldingen() {
  return useQuery({ queryKey: ['inkoop', 'meldingen'], queryFn: inkoopApi.meldingen, refetchInterval: 30000 })
}

/**
 * Het belletje onderin de zijbalk (2026-10-07): alleen wat vandaag iets vraagt —
 * te laat besteld, vandaag bestellen, komt te laat. Wat rustig wacht op
 * bundelen telt niet mee; anders went iedereen aan een getal dat altijd rood is.
 */
export function InkoopBel() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { data, error } = useInkoopMeldingen()
  const n = data?.aantal ?? 0
  return (
    <Popover opened={open} onChange={setOpen} position="top-end" shadow="md" withinPortal>
      <Popover.Target>
        <button className="st-icon-btn ib-bel" title="Meldingen" aria-label={n ? `Meldingen, ${n} voor vandaag` : 'Meldingen'} onClick={() => setOpen((o) => !o)}>
          <IconBell size={16} />
          {n > 0 && <span className="ib-bel-tel">{n}</span>}
        </button>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <div className="ib-meldingen" role="list">
          <div className="ib-melding-item" style={{ cursor: 'default', fontWeight: 600 }}>Inkoop — wat vandaag aandacht vraagt</div>
          {error && <div className="ib-melding-item" style={{ cursor: 'default' }}><div className="s">De meldingen konden niet geladen worden: {(error as Error).message}</div></div>}
          {data && data.meldingen.length === 0 && <div className="ib-melding-item" style={{ cursor: 'default' }}><div className="s">Niets voor vandaag. Alles ligt op schema.</div></div>}
          {data?.meldingen.map((m) => (
            <button key={m.regelId} type="button" role="listitem" className="ib-melding-item"
              onClick={() => { setOpen(false); navigate(`/bestellingen?regel=${m.regelId}`) }}>
              <div className={`t${m.stand === 'nu_bestellen' ? '' : ' dgr'}`}>{m.titel}</div>
              <div className="s">{m.tekst}</div>
            </button>
          ))}
          <button type="button" className="ib-melding-item" onClick={() => { setOpen(false); navigate('/bestellingen') }}><span style={{ color: 'var(--accent)' }}>Naar Bestellingen</span></button>
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}
