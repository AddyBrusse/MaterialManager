import { extractText, getDocumentProxy } from 'unpdf'

/**
 * Tekst uit een PDF halen — features/60-mail-import.md §3.4.
 *
 * De inkooporder die met de tekeningen meekomt bevat meestal de regeltabel met
 * de aantallen. Zonder de tekst eruit te halen kent de extractie alleen de
 * bestandsnamen, en die dragen zelden een aantal.
 *
 * Alleen de tekstlaag. Een gescande order (een foto in een pdf) levert niets
 * op; daar zou OCR voor nodig zijn en dat staat bewust niet in dit ontwerp.
 */

/** Ruim boven een normale order, maar voorkomt dat één rare bijlage het
 *  binnenhalen laat vastlopen. */
const MAX_PDF_BYTES = 25 * 1024 * 1024

/** Wat er van de tekst bewaard en getoond wordt. Genoeg voor een orderregel-
 *  tabel; de rest zou het reviewscherm alleen maar dichtsmeren. */
export const MAX_TEXT_CHARS = 20_000

const PDF_MAGIC = Buffer.from('%PDF-')

export function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).equals(PDF_MAGIC)
}

/**
 * Geeft de tekst, of null als er niets te halen valt. Werpt nooit: een
 * onleesbare bijlage mag het binnenhalen van de mail niet tegenhouden.
 */
export async function pdfText(buf: Buffer): Promise<string | null> {
  if (!looksLikePdf(buf) || buf.length > MAX_PDF_BYTES) return null
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const { text } = await extractText(pdf, { mergePages: true })
    const cleaned = (Array.isArray(text) ? text.join('\n') : text)
      // pdf.js levert regels met losse spaties; dubbele witruimte weg maakt de
      // patronen in extract-lines betrouwbaarder en de weergave leesbaar.
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .join('\n')
    return cleaned || null
  } catch {
    return null
  }
}
