import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@stockmanager/shared'

// machineId hoort erbij: de terminal bepaalt zijn wachtrij via de koppeling aan
// een machine, en die moet dus na het inloggen beschikbaar zijn zonder extra
// verzoek. Bij personen is hij gewoon null.
type StoredUser = Pick<User, 'id' | 'name' | 'role' | 'email' | 'achternaam' | 'titel' | 'machineId'>

interface UserStore {
  user: StoredUser | null
  setUser: (user: StoredUser) => void
  clearUser: () => void
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    { name: 'stockmanager-user' }
  )
)
