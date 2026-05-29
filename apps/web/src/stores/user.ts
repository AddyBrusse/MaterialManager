import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@stockmanager/shared'

interface UserStore {
  user: Pick<User, 'id' | 'name' | 'role'> | null
  setUser: (user: Pick<User, 'id' | 'name' | 'role'>) => void
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
