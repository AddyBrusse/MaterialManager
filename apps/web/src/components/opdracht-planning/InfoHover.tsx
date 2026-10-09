import type { ReactElement, ReactNode } from 'react'
import { HoverCard } from '@mantine/core'
import { articlesApi } from '../../api/articles'
import type { QueueJob } from '../../utils/planningQueueUtils'
import { ArtikelPreviewThumb } from '../projecten/ArtikelPreviewThumb'
import { materiaalVan } from '../../features/projects/detail/lib/document-gegevens'
import { dagKort, urenKort } from '../planning-tabel/tabel-logica'
import type { Signaal } from './signalen'

/** Na twee seconden stilstaan (zoals de Tabel): meer informatie. Niet tijdens slepen. */
export function InfoHover({ uit, inhoud, children }: { uit?: boolean; inhoud: () => ReactNode; children: ReactElement }) {
  return (
    <HoverCard openDelay={2000} closeDelay={80} position="right-start" shadow="md" withinPortal disabled={uit} withArrow>
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown p={10} style={{ maxWidth: 460 }}>{inhoud()}</HoverCard.Dropdown>
    </HoverCard>
  )
}

export interface StapRegel { job: QueueJob; start: string | null; signalen: Signaal[] }

/**
 * Alles van één artikel (orderregel) op de planning, met de tekening zoals bij
 * de offerte: klant, materiaal, stuks, levering en de stappen met machine,
 * tijd en start. `nadruk` = de stap waar de muis op staat.
 */
export function ArtikelInhoud({ order, klant, stappen, nadruk }: {
  order: QueueJob['item']['order']; klant: string; stappen: StapRegel[]; nadruk?: string
}) {
  const project = stappen[0]?.job.item.project
  const artikel = order.artikelId ? articlesApi.get(order.artikelId) : null
  const materiaal = materiaalVan(artikel)
  const rij = (label: string, waarde: ReactNode) => <><span style={{ color: 'var(--text-3)' }}>{label}</span><span>{waarde}</span></>
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
      <div style={{ flexShrink: 0 }}><ArtikelPreviewThumb article={artikel} size={120} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 2, alignContent: 'start', minWidth: 240 }}>
        <span style={{ gridColumn: '1 / -1', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{order.id}</span>
        {project && <span style={{ gridColumn: '1 / -1', marginBottom: 4 }}>{project.id} · {project.naam}</span>}
        {rij('Klant', klant)}
        {rij('Artikel', <>{order.artikelNaam}{artikel?.tekening ? ` · tek. ${artikel.tekening}${artikel.rev ? ` rev. ${artikel.rev}` : ''}` : ''}</>)}
        {materiaal && rij('Materiaal', materiaal)}
        {rij('Stuks', `${order.aantalGereed ?? 0} van ${order.qty} gereed`)}
        {rij('Levering', project?.levertijdDatum ? dagKort(project.levertijdDatum) : 'geen leverdatum')}
        {order.wachtOpMateriaal && rij('Materiaal', order.materiaalVerwacht ? `verwacht ${dagKort(order.materiaalVerwacht)}` : 'leverdatum onbekend')}
        <span style={{ gridColumn: '1 / -1', marginTop: 4, color: 'var(--text-3)' }}>Stappen</span>
        {stappen.map((s) => (
          <span key={s.job.id} style={{ gridColumn: '1 / -1', fontWeight: s.job.id === nadruk ? 600 : 400 }}>
            {s.job.volgorde}. {s.job.naam} · {s.job.machineNaam || 'geen machine'} · {urenKort(s.job.duurMin)}{s.start ? ` · start ${dagKort(s.start)}` : ' · niet ingepland'}
            {s.signalen.filter((g) => g.soort !== 'bezig' || s.job.id === nadruk).map((g) => (
              <span key={g.soort} style={{ display: 'block', paddingLeft: 12, color: g.soort === 'materiaal' ? 'var(--warning)' : g.soort === 'bezig' ? 'var(--text-3)' : 'var(--danger)' }}>{g.tekst}</span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}
