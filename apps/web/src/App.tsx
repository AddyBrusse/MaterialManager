import { useEffect, useState } from 'react'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { UserSelectScreen } from './components/common/UserSelectScreen'
import { AppLayout } from './components/layout/AppLayout'
import { PopoutShell } from './components/layout/PopoutShell'
import { MobileLayout } from './routes/mobile'
import { useUserStore } from './stores/user'

const MOBILE_BREAKPOINT = 900

// A /pop/* URL is a detached ("popped out") window for a single page — see
// utils/popout.ts. It gets its own minimal shell instead of the main
// sidebar layout, whether opened on desktop or (in principle) mobile width.
function RootShell({ isMobile }: { isMobile: boolean }) {
  const location = useLocation()
  if (location.pathname.startsWith('/pop/')) return <PopoutShell />
  return isMobile ? <MobileLayout /> : <AppLayout />
}

export default function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT)
  const user = useUserStore((s) => s.user)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (!user) return <UserSelectScreen />

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RootShell isMobile={isMobile} />
    </BrowserRouter>
  )
}
