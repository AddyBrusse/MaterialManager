import type { ReactElement } from 'react'
import { HoverCard } from '@mantine/core'
import { articlesApi } from '../../api/articles'
import type { QueueJob } from '../../utils/planningQueueUtils'
import { ArtikelPreviewThumb } from '../projecten/ArtikelPreviewThumb'
import { materiaalVan } from '../../features/projects/detail/lib/document-gegevens'
import { dagKort, urenKort } from './tabel-logica'
import type { CelInfo } from './TabelRaster'

/**
 * Na anderhalve seconde stilstaan boven een cel (2026-10-08): alles van die stap,
 * met de preview van het artikel — dezelfde als bij de offerte en op de
 * Productie-tab (STEP-weergave, anders de pdf-tekening). Niet tijdens slepen.
 */
export function CelTooltip({ j, info, uit, children }: { j: QueueJob; info: CelInfo; uit: boolean; children: ReactElement }) {
  return (
    <HoverCard openDelay={1500} closeDelay={80} position="right-start" shadow="md" withinPortal disabled={uit} withArrow
      middlewares={{ flip: true, shift: { padding: 8 } }}>
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown p={10} style={{ maxWidth: 420 }}>
        <Inhoud j={j} info={info} />
      </HoverCard.Dropdown>
    </HoverCard>
  )
}

function Inhoud({ j, info }: { j: QueueJob; info: CelInfo }) {
  const { order, project, stap } = j.item
  const artikel = order.artikelId ? articlesApi.get(order.artikelId) : null
  const materiaal = materiaalVan(artikel)
  const rij = (label: string, waarde: React.ReactNode) => (
    <><span style={{ color: 'var(--text-3)' }}>{label}</span><span>{waarde}</span></>
  )
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
      <div style={{ flexShrink: 0 }}><ArtikelPreviewThumb article={artikel} size={120} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 2, alignContent: 'start', minWidth: 220 }}>
        <span style={{ gridColumn: '1 / -1', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12.5 }}>{order.id}</span>
        <span style={{ gridColumn: '1 / -1', marginBottom: 4 }}>{project.id} · {project.naam}</span>
        {rij('Klant', info.klant)}
        {rij('Artikel', <>{order.artikelNaam}{artikel?.tekening ? ` · tek. ${artikel.tekening}${artikel.rev ? ` rev. ${artikel.rev}` : ''}` : ''}</>)}
        {materiaal && rij('Materiaal', materiaal)}
        {rij('Stap', `${stap.volgorde} van ${order.stappen.length} · ${stap.naam}${j.machineNaam && stap.geplandDatum ? ` · ${j.machineNaam}` : ''}`)}
        {rij('Stuks', `${order.aantalGereed ?? 0} van ${order.qty} gereed`)}
        {rij('Geschat', `${urenKort(j.duurMin)}${j.isPlaceholder ? ' (zonder calculatie: aanname)' : ''}`)}
        {stap.geplandDatum ? rij('Gepland', `${dagKort(info.start)} → ${dagKort(info.eind)}`) : rij('Gepland', 'niet ingepland')}
        {info.uiterlijk && rij('Uiterlijk start', dagKort(info.uiterlijk))}
        {info.achter > 0 && rij('Achter', <b style={{ color: 'var(--danger)' }}>{info.achter} werkdag{info.achter === 1 ? '' : 'en'} te laat</b>)}
        {rij('Levering', project.levertijdDatum ? dagKort(project.levertijdDatum) : 'geen leverdatum')}
        {j.wachtOpMateriaal && <span style={{ gridColumn: '1 / -1', color: 'var(--warning)', marginTop: 4 }}>Wacht op materiaal</span>}
      </div>
    </div>
  )
}
