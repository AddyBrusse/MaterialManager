import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@stockmanager/shared'

type StoredUser = Pick<User, 'id' | 'name' | 'role' | 'email' | 'achternaam' | 'titel'>

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
