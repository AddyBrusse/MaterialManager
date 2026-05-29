import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { UserSelectScreen } from './components/common/UserSelectScreen'
import { AppLayout } from './components/layout/AppLayout'
import { MobileLayout } from './routes/mobile'
import { useUserStore } from './stores/user'

const MOBILE_BREAKPOINT = 900

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
      {isMobile ? <MobileLayout /> : <AppLayout />}
    </BrowserRouter>
  )
}
