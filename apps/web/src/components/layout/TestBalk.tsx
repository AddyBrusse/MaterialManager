import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { omgevingApi } from '../../api/omgeving'
import { zetTestOmgeving } from '../../utils/omgeving'
import { datum } from '../../services/document/formaat'

const TITEL = document.title

function tijd(iso: string): string {
  const d = new Date(iso)
  return `${datum(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * De oranje balk van de testomgeving (2026-11-03), boven elk scherm: ook het
 * keuzescherm, de terminal en een los venster. Of het een test is, zegt de
 * server (de naam van de database), niet een instelling in de browser. De
 * schermen maken zelf ruimte via `--test-balk-h` (styles/tokens.css).
 */
export function TestBalk() {
  const { data } = useQuery({
    queryKey: ['omgeving'],
    queryFn: omgevingApi.haal,
    staleTime: Infinity,
    // Niet bereikbaar bij het laden? Dan blijft hij het vragen, anders mist een
    // testdocument zijn watermerk.
    refetchInterval: (q) => (q.state.data ? false : 30_000),
  })
  const test = data?.omgeving === 'test'

  useEffect(() => {
    zetTestOmgeving(test)
    document.documentElement.style.setProperty('--test-balk-h', test ? '24px' : '0px')
    document.title = test ? `[TEST] ${TITEL}` : TITEL
  }, [test])

  if (!test) return null
  return (
    <div className="test-balk" role="status">
      <strong>TESTOMGEVING — niets hiervan is echt</strong>
      {data.kopieVan && <span> · kopie van de echte gegevens van {tijd(data.kopieVan)}</span>}
      <span> · pdf’s krijgen een watermerk, mails gaan naar niemand</span>
    </div>
  )
}
