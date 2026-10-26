import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { theme } from './theme'
import { vangOnverwachteFouten } from './utils/recente-fouten'
// De lettertypes uit de app zelf, niet van Google (2026-10-24): de schermafbeelding
// bij "Dit klopt niet" kan alleen eigen lettertypes insluiten, en de app draait op
// het LAN — zonder internet viel de tekst terug op een systeemletter.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/charts/styles.css'
import './styles/tokens.css'
import './styles/planning-queue.css'
import './styles/tijdregistratie.css'
import './styles/prognose.css'

vangOnverwachteFouten()

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme}>
      {/* Rechtsonder is de standaard, maar daar staat op de projectpagina de
          primaire knop in de footer. Een toast dekt hem dan af en de volgende
          klik komt niet aan tot hij wegvalt — gemeten: de knop was enabled en
          niets mis, maar de klik landde op de melding. Rechtsboven zit niets. */}
      {/* Mantine kapt een melding standaard af op 200 px. Een foutmelding in
          drie delen (wat, waar, gevolg) is vaak hoger, en dan viel juist de
          titel en "Wat" buiten beeld — gemeten 2026-09-25. */}
      {/* Boven alles, ook boven het venster "Dit klopt niet" (1100): een
          foutmelding bij opslaan moet leesbaar zijn terwijl dat open staat. */}
      <Notifications position="top-right" notificationMaxHeight={520} zIndex={1200} />
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>
)
