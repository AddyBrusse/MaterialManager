import { useEffect, useState } from 'react'
import { HoverCard, Loader } from '@mantine/core'
import { IconPhotoOff, IconExternalLink, IconPrinter } from '@tabler/icons-react'
import type { Article } from '../../api/articles'
import { resolveArtikelPreviewSource, renderArtikelPreview, printPdfFile, PREVIEW_SIZE_LG } from '../../utils/artikelPreview'
import { StepViewer } from '../planning-queue/StepViewer'

interface Props {
  article: Article | null
  size?: number
}

export function ArtikelPreviewThumb({ article, size = 100 }: Props) {
  const source = resolveArtikelPreviewSource(article)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'empty'>(source ? 'loading' : 'empty')
  const [largeUrl, setLargeUrl] = useState<string | null>(null)
  // Drives the hover-preview panel only — separate from Mantine's own open
  // state (not exposed to children) so we control exactly when the live,
  // interactive StepViewer mounts/unmounts rather than the moment it's first
  // painted into the DOM. Only one hover panel can ever be open at a time,
  // so a single live WebGL context here doesn't reintroduce the
  // many-rows-many-contexts cost the static row thumbnails avoid.
  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    if (!source) { setStatus('empty'); return }
    let cancelled = false
    setStatus('loading')
    setDataUrl(null)
    setLargeUrl(null)
    renderArtikelPreview(source)
      .then(url => { if (!cancelled) { setDataUrl(url); setStatus('ready') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [source?.kind, source?.url])

  // Static large render only needed for the PDF fallback — a STEP source
  // gets the live StepViewer instead (see below), which handles its own
  // loading state.
  function loadLargePdf() {
    if (!source || source.kind !== 'pdf' || largeUrl) return
    renderArtikelPreview(source, PREVIEW_SIZE_LG).then(setLargeUrl).catch(() => {})
  }

  function handleEnter() {
    setHovering(true)
    loadLargePdf()
  }
  function handleLeave() {
    setHovering(false)
  }

  const thumb = (
    <div
      className={`art-preview-thumb${status !== 'ready' ? ' art-preview-thumb-empty' : ''}`}
      style={{ width: size, height: size }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {status === 'loading' && <Loader size={18} />}
      {status === 'ready' && dataUrl && <img src={dataUrl} alt={source?.name ?? ''} title={source?.name} />}
      {(status === 'empty' || status === 'error') && <IconPhotoOff size={22} stroke={1.5} />}
    </div>
  )

  if (!source || status !== 'ready') return thumb

  return (
    <HoverCard width={500} shadow="md" position="right" withArrow openDelay={150} closeDelay={100} zIndex={400}>
      <HoverCard.Target>{thumb}</HoverCard.Target>
      {/* onMouseEnter/Leave here too — moving from the thumb into the
          dropdown to orbit the model must not unmount StepViewer mid-hover. */}
      <HoverCard.Dropdown p={10} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        <div className="art-preview-hover">
          <div className="art-preview-hover-img">
            {source.kind === 'step'
              ? (hovering ? <StepViewer url={source.url} /> : <Loader size={22} />)
              : (largeUrl ? <img src={largeUrl} alt={source.name} /> : <Loader size={22} />)}
          </div>
          <div className="art-preview-hover-name">{source.name}</div>
          <div className="art-preview-hover-actions">
            <button className="st-btn sm ghost" onClick={() => window.open(source.url, '_blank')}>
              <IconExternalLink size={13} />Ga naar bestand
            </button>
            {source.kind === 'pdf' && (
              <button className="st-btn sm ghost" onClick={() => printPdfFile(source.url)}>
                <IconPrinter size={13} />Print bestand
              </button>
            )}
          </div>
        </div>
      </HoverCard.Dropdown>
    </HoverCard>
  )
}
