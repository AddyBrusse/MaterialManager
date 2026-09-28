import type jsPDF from 'jspdf'

/**
 * Een pdf tonen in een eigen venster, zonder de app te blokkeren (besloten
 * 2026-09-28): geen modal, maar een los venster dat je naast de app of op een
 * tweede scherm zet. Het volgende document opent in hetzelfde venster — de
 * naam `sm-document` zorgt daarvoor — zodat er geen tien vensters ontstaan.
 *
 * Wat je ziet is de pdf zelf, uit dezelfde code als downloaden en mailen: een
 * eigen voorbeeldweergave zou kunnen afwijken van wat de klant krijgt.
 *
 * Voor offertes en opdrachtbevestigingen; bewust niet aan één soort gebonden.
 */
const VENSTER = 'sm-document'
let vorigeUrl: string | null = null

export function toonPdfInVenster(doc: jsPDF, opts: { titel: string; bestandsnaam: string }): boolean {
  const url = URL.createObjectURL(doc.output('blob'))
  const breed = Math.min(900, Math.round(window.screen.availWidth * 0.5))
  const hoog = Math.round(window.screen.availHeight * 0.9)
  const w = window.open('', VENSTER, `popup=yes,width=${breed},height=${hoog}`)
  if (!w) {
    URL.revokeObjectURL(url)
    return false
  }
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  w.document.open()
  w.document.write(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(opts.titel)}</title>
<style>
  html,body{margin:0;height:100%;font:12px system-ui,sans-serif;background:#f4f5f7}
  .balk{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;background:#fff;border-bottom:1px solid #d8dde8}
  .balk strong{flex:1;font-size:12.5px}
  .balk a{color:#1a5fc8;text-decoration:none;font-weight:600;padding:5px 9px;border:1px solid #d8dde8;border-radius:4px;background:#fff}
  iframe{display:block;width:100%;height:calc(100% - 37px);border:0}
</style></head><body>
<div class="balk"><strong>${esc(opts.titel)}</strong>
<a href="${url}" target="_blank" rel="noopener">Open in browsertabblad</a>
<a href="${url}" download="${esc(opts.bestandsnaam)}">Download</a></div>
<iframe src="${url}" title="${esc(opts.titel)}"></iframe>
</body></html>`)
  w.document.close()
  w.focus()
  // De vorige pdf is niet meer te zien; zijn geheugen mag vrij.
  if (vorigeUrl) URL.revokeObjectURL(vorigeUrl)
  vorigeUrl = url
  return true
}
