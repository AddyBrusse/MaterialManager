import { notifications } from '@mantine/notifications'
import { foutTekst } from './fout-melding'

/**
 * Toont een foutmelding in de vaste drie delen (zie `foutTekst`).
 *
 * Blijft staan tot hij weggeklikt wordt. Een fout die na vier seconden
 * verdwijnt is een fout die niemand heeft kunnen lezen — en juist de
 * gevolg-regel moet je gelezen hebben voor je verder werkt.
 */
export function meldFout(p: { actie: string; fout: unknown; gevolg: string }): void {
  const t = foutTekst(p)
  // De volledige fout ook in de console, voor wie hem doorgeeft of zoekt.
  console.error(`[${t.titel}]`, p.fout)
  notifications.show({
    color: 'red',
    title: t.titel,
    autoClose: false,
    message: (
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 8, rowGap: 2, fontSize: 12 }}>
        <strong>Wat</strong>
        <span>{t.wat}</span>
        <strong>Waar</strong>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{t.waar}</span>
        <strong>Gevolg</strong>
        <span>{t.gevolg}</span>
      </div>
    ),
  })
}
