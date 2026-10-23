import { useEditLock, type EditLockState } from './useEditLock'

export type ProjectLockState = EditLockState

/** Het bewerkingsslot van een project; zie `useEditLock`. */
export function useProjectLock(id: string, enabled = true): ProjectLockState {
  return useEditLock('project', id, enabled)
}
