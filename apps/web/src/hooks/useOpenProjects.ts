import { useSyncExternalStore } from 'react'
import {
  subscribeOpenProjects,
  getOpenProjectsSnapshot,
  type OpenProjectTab,
} from '../utils/openProjects'

/** The current ordered list of open project tabs, reactive to changes. */
export function useOpenProjects(): OpenProjectTab[] {
  return useSyncExternalStore(subscribeOpenProjects, getOpenProjectsSnapshot, getOpenProjectsSnapshot)
}
