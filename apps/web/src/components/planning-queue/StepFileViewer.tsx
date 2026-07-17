import { useState, useEffect } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { StepViewer } from './StepViewer'

export interface StepFileRef { name: string; url: string }

interface StepFileViewerProps {
  files: StepFileRef[]
}

export function StepFileViewer({ files }: StepFileViewerProps) {
  const [index, setIndex] = useState(0)

  // A different order can have fewer files than the previously selected one
  // was showing — clamp instead of pointing past the end of the new list.
  useEffect(() => { setIndex(0) }, [files])

  if (files.length === 0) {
    return (
      <div className="wq-dp-preview">
        <div className="wq-dp-preview-empty">
          <div>Geen step-bestand beschikbaar</div>
          <div style={{ fontSize: 11 }}>voor dit onderdeel</div>
        </div>
      </div>
    )
  }

  const current = files[Math.min(index, files.length - 1)]

  return (
    <div className="wq-step-viewer">
      <StepViewer url={current.url} />
      <span className="wq-dp-preview-hint" style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {current.name}
      </span>
      {files.length > 1 && (
        <div className="wq-dp-file-nav">
          <button className="wq-dp-nav-btn" onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0}>
            <IconChevronLeft size={16} />
          </button>
          <span className="wq-dp-file-count">{index + 1} / {files.length}</span>
          <button className="wq-dp-nav-btn" onClick={() => setIndex(i => Math.min(files.length - 1, i + 1))} disabled={index === files.length - 1}>
            <IconChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
