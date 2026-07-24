import './article-fileviewer.css'
import { useEffect, useMemo, useState } from 'react'
import type { Article, ArticleAttachment } from '../../api/articles'
import { StepViewer } from '../planning-queue/StepViewer'
import { Ic, Icon } from './calc-icons'

export interface ArticleFileViewerProps {
  article: Article
}

// Display renderer chosen per file. `.step`/`.stp` map to 'document' via
// inferAttachmentKind, so we detect them here explicitly to route to the 3D viewer.
type ViewerType = '3d' | 'pdf' | 'image' | 'nc' | 'document'

interface ViewerFile {
  id: string
  name: string
  path: string
  type: ViewerType
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
const NC_EXTS = ['nc', 'tap', 'mpf', 'eia', 'gcode', 'ngc', 'ptp', 'h']

function fileExt(name: string): string {
  return name.toLowerCase().split('.').pop() ?? ''
}

function detectType(name: string): ViewerType {
  const ext = fileExt(name)
  if (ext === 'step' || ext === 'stp') return '3d'
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (NC_EXTS.includes(ext)) return 'nc'
  return 'document'
}

function badgeLabel(name: string): string {
  const ext = fileExt(name)
  return ext ? ext.toUpperCase() : 'DOC'
}

function typeIconPath(type: ViewerType): string {
  switch (type) {
    case '3d': return Icon.box
    case 'nc': return Icon.cpu
    default: return Icon.file
  }
}

function hasPath(a: ArticleAttachment): a is ArticleAttachment & { path: string } {
  return a.path != null && a.path !== ''
}

export function ArticleFileViewer({ article }: ArticleFileViewerProps) {
  const files = useMemo<ViewerFile[]>(
    () =>
      article.attachments
        .filter(hasPath)
        .map(a => ({ id: a.id, name: a.name, path: a.path, type: detectType(a.name) })),
    [article.attachments],
  )

  const [activeIdx, setActiveIdx] = useState(0)
  useEffect(() => {
    setActiveIdx(i => (files.length === 0 ? 0 : Math.min(i, files.length - 1)))
  }, [files.length])

  if (files.length === 0) {
    return (
      <div className="afv-card">
        <div className="afv-empty">
          <Ic d={Icon.file} size={22} />
          <span>Geen bestanden</span>
        </div>
      </div>
    )
  }

  // Clamp during render, not only in the effect: when `files` shrinks (an
  // attachment removed, or navigating to an article with fewer files while the
  // header stays mounted) the effect runs a tick too late, so `files[activeIdx]`
  // would be undefined on this render and crash the toolbar.
  const safeIdx = Math.min(activeIdx, files.length - 1)
  const active = files[safeIdx]
  const step = (delta: number) =>
    setActiveIdx(() => (safeIdx + delta + files.length) % files.length)

  return (
    <div className="afv-card">
      <div className="afv-toolbar">
        <span className="afv-toolbar-icon"><Ic d={typeIconPath(active.type)} size={15} /></span>
        <span className="afv-filename">{active.name}</span>
        <span className="afv-badge">{badgeLabel(active.name)}</span>
        <span className="afv-counter">{safeIdx + 1} / {files.length}</span>
        <button type="button" className="afv-nav" aria-label="Vorige" onClick={() => step(-1)}>
          <Ic d={Icon.chevronRight} size={14} className="afv-nav-prev" />
        </button>
        <button type="button" className="afv-nav" aria-label="Volgende" onClick={() => step(1)}>
          <Ic d={Icon.chevronRight} size={14} />
        </button>
      </div>

      <div className="afv-body">
        {active.type === '3d' && (
          <>
            <StepViewer url={active.path} />
            <span className="afv-drag-pill">Sleep om te draaien</span>
          </>
        )}

        {(active.type === 'pdf' || active.type === 'document') && (
          <div className="afv-doc">
            <span className="afv-doc-icon"><Ic d={Icon.file} size={30} /></span>
            <span className="afv-doc-name">{active.name}</span>
            <a className="afv-doc-open" href={active.path} target="_blank" rel="noreferrer">
              Openen
            </a>
          </div>
        )}

        {active.type === 'image' && (
          <div className="afv-image-tile">
            <img className="afv-image" src={active.path} alt={active.name} />
          </div>
        )}

        {active.type === 'nc' && (
          <div className="afv-nc">
            <div className="afv-nc-head">
              <Ic d={Icon.cpu} size={13} />
              <span>{active.name}</span>
            </div>
            <div className="afv-nc-lines">
              <span>; NC-programma</span>
              <span>; {active.name}</span>
              <span>; open het bestand om de code te bekijken</span>
            </div>
          </div>
        )}
      </div>

      <div className="afv-thumbs">
        {files.map((f, i) => (
          <button
            key={f.id}
            type="button"
            className={`afv-thumb${i === safeIdx ? ' is-active' : ''}`}
            onClick={() => setActiveIdx(i)}
            title={f.name}
          >
            <Ic d={typeIconPath(f.type)} size={13} />
            <span className="afv-thumb-name">{f.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
