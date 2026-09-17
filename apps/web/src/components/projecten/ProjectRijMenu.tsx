import { useState } from 'react'
import { Menu } from '@mantine/core'
import {
  IconFolder, IconTrash, IconExchange, IconCheck, IconArrowRight, IconDots,
  IconArrowBackUp, IconPlayerPause, IconPlayerPlay, IconBan, IconChevronRight, IconChevronDown,
} from '@tabler/icons-react'
import type { Project } from '@stockmanager/shared'
import type { ProjectRijActies } from '../../hooks/useProjectRijActies'
import { statusActies, isStilgezet } from './project-status-acties'

const ICOON = {
  huidig:      <IconCheck size={13} />,
  vooruit:     <IconArrowRight size={13} />,
  terug:       <IconArrowBackUp size={13} />,
  geblokkeerd: null,
}

/** Reden of gevolg rechts in het item — een tooltip werkt niet op een disabled item. */
function Toelichting({ tekst }: { tekst: string }) {
  return <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{tekst}</span>
}

/**
 * De zeven fases, uitgeklapt binnen hetzelfde menu.
 *
 * Geen zwevend submenu: `Menu.Sub` bestaat in @mantine/core 7.17.8 nog niet,
 * en een genest `Menu` hangt zijn dropdown in een eigen portal — dan telt een
 * klik op een subitem voor het bovenliggende menu als een klik buiten de
 * dropdown, dat menu sluit op mousedown en het subitem is weg vóór de klik
 * aankomt. Eén dropdown die uitklapt heeft dat probleem niet.
 */
function StatusItems({ project, acties, sluit }: RijMenuProps) {
  return (
    <>
      {statusActies(project).map(item => {
        const a = item.actie
        return (
          <Menu.Item
            key={item.status}
            disabled={a.soort === 'huidig' || a.soort === 'geblokkeerd'}
            leftSection={ICOON[a.soort]}
            rightSection={
              a.soort === 'huidig'      ? <Toelichting tekst="huidige status" /> :
              a.soort === 'geblokkeerd' ? <Toelichting tekst={a.reden} /> :
              a.soort === 'vooruit'     ? <Toelichting tekst="opent tab" /> : null
            }
            style={{ paddingLeft: 26 }}
            onClick={() => { sluit(); acties.status(project, item) }}
          >
            {item.label}
          </Menu.Item>
        )
      })}
    </>
  )
}

interface RijMenuProps {
  project: Project
  acties: ProjectRijActies
  /** Sluit het omhullende menu; een genest menu doet dat niet vanzelf. */
  sluit: () => void
}

/**
 * De inhoud van het rijmenu. Gedeeld door de ⋯-knop en het rechtermuismenu,
 * zodat er maar één lijst acties bestaat.
 */
export function ProjectRijMenuItems({ project, acties, sluit }: RijMenuProps) {
  const [statusOpen, setStatusOpen] = useState(false)
  const doe = (fn: () => void) => () => { sluit(); fn() }
  return (
    <>
      <Menu.Item leftSection={<IconFolder size={14} />} onClick={doe(() => acties.openen(project))}>
        Openen
      </Menu.Item>

      <Menu.Item
        closeMenuOnClick={false}
        leftSection={<IconExchange size={14} />}
        rightSection={statusOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        onClick={() => setStatusOpen(o => !o)}
      >
        Status wijzigen
      </Menu.Item>
      {statusOpen && <StatusItems project={project} acties={acties} sluit={sluit} />}

      <Menu.Divider />

      {isStilgezet(project) ? (
        <Menu.Item leftSection={<IconPlayerPlay size={14} />} onClick={doe(() => acties.hervatten(project))}>
          Hervatten
        </Menu.Item>
      ) : (
        <>
          <Menu.Item leftSection={<IconPlayerPause size={14} />} onClick={doe(() => acties.stilleggen(project, 'on_hold'))}>
            On hold zetten…
          </Menu.Item>
          <Menu.Item leftSection={<IconBan size={14} />} onClick={doe(() => acties.stilleggen(project, 'geannuleerd'))}>
            Annuleren…
          </Menu.Item>
        </>
      )}

      <Menu.Divider />

      <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={doe(() => acties.verwijderen(project))}>
        Verwijderen
      </Menu.Item>
    </>
  )
}

/** Hetzelfde menu achter de ⋯-knop in de actiekolom. */
export function ProjectDotsMenu({ project, acties }: { project: Project; acties: ProjectRijActies }) {
  const [open, setOpen] = useState(false)
  return (
    <Menu opened={open} onChange={setOpen} position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <button className="st-icon-btn" title="Acties"><IconDots size={15} /></button>
      </Menu.Target>
      <Menu.Dropdown>
        <ProjectRijMenuItems project={project} acties={acties} sluit={() => setOpen(false)} />
      </Menu.Dropdown>
    </Menu>
  )
}

export interface ContextMenuState { x: number; y: number; project: Project }

/**
 * Hetzelfde menu, maar op de cursor. Het anker is een leeg element van 1×1 op
 * de klikpositie: Mantine positioneert een dropdown altijd ten opzichte van
 * een target, en dit is het kleinst mogelijke.
 */
export function ProjectContextMenu({
  state, onClose, acties,
}: { state: ContextMenuState | null; onClose: () => void; acties: ProjectRijActies }) {
  if (!state) return null
  return (
    // De key laat het menu opnieuw monteren bij een rechtsklik op een andere
    // rij: Mantine plaatst de dropdown bij het openen, en zonder remount zou
    // hij op de vorige klikpositie blijven staan.
    <Menu
      key={`${state.x},${state.y}`}
      opened
      onClose={onClose}
      position="bottom-start"
      offset={2}
      withinPortal
      shadow="md"
    >
      <Menu.Target>
        <div style={{ position: 'fixed', left: state.x, top: state.y, width: 1, height: 1 }} />
      </Menu.Target>
      <Menu.Dropdown>
        <ProjectRijMenuItems project={state.project} acties={acties} sluit={onClose} />
      </Menu.Dropdown>
    </Menu>
  )
}
