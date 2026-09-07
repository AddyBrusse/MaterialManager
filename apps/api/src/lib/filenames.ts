/**
 * Namen die veilig zijn op Windows/NAS (SMB) en toch leesbaar blijven —
 * uploads worden ook rechtstreeks op schijf bekeken, niet alleen via de app.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    // Padscheiding mag nooit uit een bestandsnaam komen: een bijlage die
    // "../../etc/passwd" heet moet in de eigen map blijven staan.
    .replace(/\.\.+/g, '.')
    .replace(/^\.+/, '')
    .trim()
  return (cleaned || 'bestand').slice(0, 200)
}
