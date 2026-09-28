/**
 * Een mail klaarzetten in Outlook, zonder koppeling met Microsoft 365.
 *
 * De Graph-koppeling is er niet (de beheerder heeft hem niet vrijgegeven), en
 * een `mailto:`-link kan geen bijlage meegeven. Daarom een `.eml`-bestand: een
 * gewone mail als bestand, met de pdf erin en de kop `X-Unsent: 1`. Het klassieke
 * Outlook voor Windows opent zo'n bestand als nieuwe, nog niet verzonden mail —
 * aan, onderwerp, tekst en bijlage staan klaar, je drukt op Verzenden.
 *
 * Nog te bevestigen op de werk-pc (2026-09-28): hier is geen Outlook om het
 * mee te testen. Werkt het niet, dan is `mailtoZonderBijlage` de terugval.
 */

export interface EmlMail {
  naar: string | null
  onderwerp: string
  /** HTML-tekst van de mail. */
  html: string
  bijlage: { naam: string; type: string; base64: string }
}

const CRLF = '\r\n'

function utf8Base64(tekst: string): string {
  const bytes = new TextEncoder().encode(tekst)
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

/** Base64 in regels van 76 tekens, zoals mailprogramma's het verwachten. */
function regels(b64: string): string {
  return b64.match(/.{1,76}/g)?.join(CRLF) ?? ''
}

/** Een kopregel met tekens buiten ASCII (é, —) in de vorm die elke client leest. */
function kop(tekst: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(tekst) ? tekst : `=?UTF-8?B?${utf8Base64(tekst)}?=`
}

export function maakEml(m: EmlMail): string {
  const grens = `----=_ShopCommand_${Math.random().toString(36).slice(2)}`
  const koppen = [
    ...(m.naar ? [`To: ${m.naar}`] : []),
    `Subject: ${kop(m.onderwerp)}`,
    // Dit maakt er een concept van in plaats van een ontvangen bericht.
    'X-Unsent: 1',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${grens}"`,
  ]
  return [
    ...koppen,
    '',
    `--${grens}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    regels(utf8Base64(m.html)),
    '',
    `--${grens}`,
    `Content-Type: ${m.bijlage.type}; name="${m.bijlage.naam}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${m.bijlage.naam}"`,
    '',
    regels(m.bijlage.base64),
    '',
    `--${grens}--`,
    '',
  ].join(CRLF)
}

export function downloadEml(mail: EmlMail, bestandsnaam: string): void {
  const blob = new Blob([maakEml(mail)], { type: 'message/rfc822' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = bestandsnaam
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Terugval: een lege mail in Outlook, zonder bijlage — die sleep je er zelf in. */
export function mailtoZonderBijlage(naar: string | null, onderwerp: string, tekst: string): string {
  return `mailto:${encodeURIComponent(naar ?? '')}?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(tekst)}`
}
