import { useSyncExternalStore } from 'react'
import {
  subscribeProjectSaveState,
  getProjectSaveState,
  type ProjectSaveState,
} from '../api/projects'

/** Reactive autosave state for one project (idle | saving | saved | error). */
export function useProjectSaveState(id: string): ProjectSaveState {
  return useSyncExternalStore(
    subscribeProjectSaveState,
    () => getProjectSaveState(id),
    () => getProjectSaveState(id),
  )
}
