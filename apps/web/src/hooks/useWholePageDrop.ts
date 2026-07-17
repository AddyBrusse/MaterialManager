import { useEffect, useRef, useState } from 'react'

/**
 * Turns the whole browser viewport into a drop target — not just one
 * dedicated dropzone element — by listening on `window` instead of a
 * specific DOM node. Avoids wrapping page content in an extra container
 * div just to attach a drop handler (which, on flex-column page layouts
 * that key off direct-child CSS selectors, silently breaks sizing).
 *
 * dragenter/dragleave fire once per element the cursor crosses and bubble
 * to window, so a naive show-on-enter/hide-on-leave flickers constantly —
 * the depth counter balances enter/leave pairs and only flips `dragging`
 * at 0.
 *
 * `onFiles` is read via a ref, NOT a `useEffect` dependency: the listener
 * lifecycle must depend only on `enabled`. Callers typically pass an inline
 * closure that's a new function identity every render (this hook's own
 * `setDragging(true)` triggers exactly such a re-render) — with `onFiles`
 * in the dependency array, that identity change tears the listeners down
 * and rebuilds them on every state change, and the teardown's cleanup reset
 * `dragging` back to false before anyone could ever observe it true.
 */
export function useWholePageDrop(enabled: boolean, onFiles: (files: FileList) => void): boolean {
  const [dragging, setDragging] = useState(false)
  const onFilesRef = useRef(onFiles)
  onFilesRef.current = onFiles

  useEffect(() => {
    if (!enabled) return
    let depth = 0

    function hasFiles(e: DragEvent): boolean {
      return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    }
    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    function onDragOver(e: DragEvent) {
      // Browsers default to "navigate to the dropped file" unless dragover
      // is prevented — this is what actually makes drop work anywhere.
      if (!hasFiles(e)) return
      e.preventDefault()
    }
    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (e.dataTransfer?.files?.length) onFilesRef.current(e.dataTransfer.files)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      setDragging(false)
    }
  }, [enabled])

  return dragging
}
