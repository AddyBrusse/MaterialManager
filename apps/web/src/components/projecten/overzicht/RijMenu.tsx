import { Menu } from '@mantine/core'
import {
  IconFolder, IconFilter, IconPlus, IconUserPlus, IconCopy, IconPlayerPause,
  IconBan, IconPlayerPlay, IconTrash, IconSquareOff, IconPrinter,
} from '@tabler/icons-react'
import type { Project } from '@stockmanager/shared'
import type { SnelFilter } from './snelle-filters'
import type { Filter } from './filters'
import type { RijActies } from './useRijActies'

export interface MenuPlek {
  x: number
  y: number
  /** De rij waarop geklikt is; bepaalt de snelle filters. */
  project: Project
  /** De kolom waarop geklikt is (`null` via het ⋯-knopje). */
  kolomId: string | null
}

interface Props {
  plek: MenuPlek | null
  /**
   * Waar de acties op werken: de selectie als de rij daarin zit, anders alleen
   * deze rij — zoals in een bestandsverkenner.
   */
  doel: Project[]
  snel: SnelFilter[]
  klantNaam: string
  acties: RijActies
  onFilter: (f: Filter) => void
  onOpen: (p: Project) => void
  onWisSelectie: () => void
  onSluit: () => void
}

/**
 * Het rechtermuisknopmenu van een projectrij (2026-10-05); het ⋯-knopje aan
 * het eind van de rij opent hetzelfde menu. Mantine 7 kent geen submenu's,
 * dus de filters staan als blok in het menu, met per regel een ≠-knopje voor
 * "alles behalve".
 */
export function RijMenu({ plek, doel, snel, klantNaam, acties, onFilter, onOpen, onWisSelectie, onSluit }: Props) {
  if (!plek) return null
  const p = plek.project
  const veel = doel.length > 1
  const n = veel ? ` (${doel.length})` : ''
  const kanHold = doel.some((x) => acties.kanStoppen(x, 'on_hold'))
  const kanAnnuleren = doel.some((x) => acties.kanStoppen(x, 'geannuleerd'))
  const kanHervatten = doel.some(acties.stilgezet)

  return (
    <Menu
      // Nieuwe plek = nieuw menu, anders blijft het op de vorige plek hangen.
      key={`${plek.x},${plek.y},${p.id}`}
      opened
      onChange={(o) => !o && onSluit()}
      position="bottom-start"
      offset={2}
      shadow="md"
      withinPortal
      closeOnItemClick
    >
      <Menu.Target>
        <div style={{ position: 'fixed', left: plek.x, top: plek.y, width: 0, height: 0 }} />
      </Menu.Target>
      <Menu.Dropdown className="prj-rijmenu" onContextMenu={(e) => e.preventDefault()}>
        <Menu.Label>{veel ? `${doel.length} projecten geselecteerd` : `${p.id} · ${p.naam}`}</Menu.Label>
        {!veel && (
          <Menu.Item leftSection={<IconFolder size={14} />} onClick={() => onOpen(p)}>Openen</Menu.Item>
        )}

        {snel.length > 0 && (
          <>
            <Menu.Divider />
            <Menu.Label>Filter op{veel ? ` ${p.id}` : ''}</Menu.Label>
            {snel.map((s) => (
              <Menu.Item
                key={JSON.stringify(s.filter)}
                leftSection={<IconFilter size={13} />}
                onClick={() => onFilter(s.filter)}
                rightSection={s.omkeerbaar ? (
                  <button
                    type="button"
                    className="prj-rijmenu-niet"
                    title="Alles behalve dit"
                    aria-label={`Alles behalve ${s.label}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onFilter({ ...s.filter, niet: true } as Filter)
                      onSluit()
                    }}
                  >
                    ≠
                  </button>
                ) : null}
              >
                {s.label}
              </Menu.Item>
            ))}
          </>
        )}

        <Menu.Divider />
        <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => acties.nieuwProject()}>Nieuw project</Menu.Item>
        {!veel && p.relatieId && (
          <Menu.Item leftSection={<IconUserPlus size={14} />} onClick={() => acties.nieuwProject(p)}>
            Nieuw project voor {klantNaam || 'deze klant'}
          </Menu.Item>
        )}
        <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => acties.kopieerNummers(doel)}>
          {veel ? `Projectnummers kopiëren${n}` : 'Projectnummer kopiëren'}
        </Menu.Item>
        {!veel && (
          <Menu.Item leftSection={<IconPrinter size={14} />} onClick={() => acties.zaagbon(p)}>Zaagbon afdrukken</Menu.Item>
        )}

        <Menu.Divider />
        {kanHold && (
          <Menu.Item leftSection={<IconPlayerPause size={14} />} onClick={() => acties.stop(doel, 'on_hold')}>
            On hold zetten{n}
          </Menu.Item>
        )}
        {kanHervatten && (
          <Menu.Item leftSection={<IconPlayerPlay size={14} />} onClick={() => acties.hervat(doel)}>
            Hervatten{veel ? ` (${doel.filter(acties.stilgezet).length})` : ''}
          </Menu.Item>
        )}
        {kanAnnuleren && (
          <Menu.Item leftSection={<IconBan size={14} />} onClick={() => acties.stop(doel, 'geannuleerd')}>
            Annuleren{n}
          </Menu.Item>
        )}
        {veel && (
          <Menu.Item leftSection={<IconSquareOff size={14} />} onClick={onWisSelectie}>Selectie opheffen</Menu.Item>
        )}
        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => acties.verwijder(doel)}>
          Verwijderen{n}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
