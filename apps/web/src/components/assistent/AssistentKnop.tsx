import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconSparkles } from '@tabler/icons-react'
import { assistentApi, type ChatBericht } from '../../api/assistent'
import { useUserStore } from '../../stores/user'
import { AssistentPaneel } from './AssistentPaneel'

const sleutel = (userId: string) => `assistent.gezien.${userId}`

function gezien(userId: string): string | null {
  try { return localStorage.getItem(sleutel(userId)) } catch { return null }
}
function markeer(userId: string, moment: string) {
  // Alleen een gemak: lukt opslaan niet, dan opent het paneel de volgende keer gewoon nog eens.
  try { localStorage.setItem(sleutel(userId), moment) } catch { /* zie hierboven */ }
}

/**
 * De knop van de assistent (2026-10-09). Is er een nieuw bericht (8:00, 15:00 —
 * Instellingen), dan gaat het paneel vanzelf één keer open; daarna blijft het
 * met deze knop te openen. "Gezien" onthoudt elke browser per gebruiker.
 */
export function AssistentKnop() {
  const user = useUserStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const [chat, setChat] = useState<ChatBericht[]>([])
  const { data, error } = useQuery({
    queryKey: ['assistent-bericht'],
    queryFn: assistentApi.bericht,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    enabled: !!user,
  })
  const nieuw = !!(user && data && gezien(user.id) !== data.moment)

  useEffect(() => {
    if (nieuw) setOpen(true)
  }, [nieuw, data?.moment])
  useEffect(() => {
    if (open && user && data) markeer(user.id, data.moment)
  }, [open, user, data])

  if (!user) return null
  return (
    <>
      <button className="st-icon-btn as-knop" title="Assistent" aria-label="Assistent openen" data-nieuw={nieuw || undefined}
        onClick={() => setOpen((o) => !o)}>
        <IconSparkles size={16} />
      </button>
      {open && (
        <AssistentPaneel naam={user.name} bericht={data} berichtFout={error} chat={chat} setChat={setChat}
          onSluit={() => setOpen(false)} />
      )}
    </>
  )
}
