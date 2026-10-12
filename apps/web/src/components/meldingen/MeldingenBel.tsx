import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Popover } from '@mantine/core'
import { IconBell } from '@tabler/icons-react'
import { meldingenApi, type Melding } from '../../api/meldingen'
import '../inkoop/overzicht/overzicht.css'
import './meldingen.css'

const GROEP: Record<Melding['groep'], string> = {
  productie: 'Productie — materiaal',
  inkoop: 'Inkoop — vandaag',
  prijsaanvraag: 'Prijsaanvragen zonder antwoord',
  ontvangst: 'Ontvangst',
}

export function useMeldingen() {
  return useQuery({ queryKey: ['meldingen'], queryFn: meldingenApi.lijst, refetchInterval: 30000 })
}

/**
 * Het belletje (2026-10-09): één lijst voor iedereen — tekorten, materiaal dat
 * te laat komt, prijsaanvragen zonder antwoord, wat vandaag besteld moet en
 * wat net binnen is. Een melding verdwijnt pas als het opgelost is.
 */
export function MeldingenBel() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { data, error } = useMeldingen()
  const n = data?.aantal ?? 0
  const groepen = (Object.keys(GROEP) as Melding['groep'][])
    .map((g) => ({ g, lijst: data?.meldingen.filter((m) => m.groep === g) ?? [] }))
    .filter((x) => x.lijst.length > 0)
  return (
    <Popover opened={open} onChange={setOpen} position="top-end" shadow="md" withinPortal>
      <Popover.Target>
        <button className="st-icon-btn ib-bel" title="Meldingen" aria-label={n ? `Meldingen, ${n} open` : 'Meldingen'} onClick={() => setOpen((o) => !o)}>
          <IconBell size={16} />
          {n > 0 && <span className="ib-bel-tel" data-rood={data!.rood > 0 || undefined}>{n}</span>}
        </button>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <div className="ib-meldingen" role="list" style={{ width: 430, maxHeight: 520 }}>
          <div className="ib-melding-item" style={{ cursor: 'default', fontWeight: 600 }}>Meldingen — verdwijnen als het opgelost is</div>
          {error && <div className="ib-melding-item" style={{ cursor: 'default' }}><div className="s">De meldingen konden niet geladen worden: {(error as Error).message}</div></div>}
          {data && data.meldingen.length === 0 && <div className="ib-melding-item" style={{ cursor: 'default' }}><div className="s">Niets open. Alles ligt op schema.</div></div>}
          {groepen.map(({ g, lijst }) => (
            <div key={g}>
              <div className="mb-groep">{GROEP[g]}</div>
              {lijst.map((m) => (
                <button key={m.id} type="button" role="listitem" className="ib-melding-item mb-item"
                  onClick={() => { setOpen(false); navigate(m.link) }}>
                  <span className={`mb-dot ${m.ernst}`} />
                  <span>
                    <div className={`t${m.ernst === 'rood' ? ' dgr' : ''}`}>{m.titel}</div>
                    <div className="s">{m.tekst}</div>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}
