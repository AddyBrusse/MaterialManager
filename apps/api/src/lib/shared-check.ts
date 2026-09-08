import {
  MAIL_IMPORT_STATUSES, MAIL_INTENTS, MAIL_SOURCES, MATCH_STATUSES,
  EXTRACTORS, SENDER_ORIGINS,
} from '@stockmanager/shared'

/**
 * Controleren of @stockmanager/shared echt opnieuw gebouwd is.
 *
 * `packages/shared` draait op zijn *gecompileerde* uitvoer (`main` wijst naar
 * dist), terwijl `ts-node-dev --transpile-only` en Vite niets typecontroleren.
 * Een verouderde dist wordt daardoor stilzwijgend gebruikt: een constante die er
 * nog niet in staat is `undefined`, en `z.enum(undefined)` bouwt een enum zonder
 * waarden. Die klapt pas véél later, bij het eerste verzoek dat hem raakt, met
 * "Cannot read properties of undefined (reading 'map')" — een fout die niets
 * zegt over de oorzaak. Waargenomen 2026-09-08: het reviewscherm werkte, maar
 * opslaan gaf een interne serverfout.
 *
 * De build hangt nu aan `postinstall` en aan de dev-scripts, dus dit hoort niet
 * meer voor te komen. Deze controle is de vangnet-laag: bij het opstarten
 * meteen zeggen wat er mis is, in plaats van een raadsel bij het eerste verzoek.
 */
const VERWACHT: Record<string, readonly string[]> = {
  MAIL_IMPORT_STATUSES, MAIL_INTENTS, MAIL_SOURCES, MATCH_STATUSES,
  EXTRACTORS, SENDER_ORIGINS,
}

export function assertSharedGebouwd(): void {
  const ontbreekt = Object.entries(VERWACHT)
    .filter(([, waarden]) => !Array.isArray(waarden) || waarden.length === 0)
    .map(([naam]) => naam)

  if (ontbreekt.length === 0) return

  throw new Error(
    `@stockmanager/shared is verouderd of niet gebouwd — ${ontbreekt.join(', ')} ontbreekt.\n` +
      'Draai: npm run build -w packages/shared'
  )
}
