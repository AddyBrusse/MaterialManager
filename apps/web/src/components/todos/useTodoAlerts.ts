import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { rawMaterialsApi } from '../../api/raw-materials'
import { articlesApi } from '../../api/articles'
import { projectsApi } from '../../api/projects'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { getLowStockAlerts, getDueRiskAlerts, getProductionOverrunAlerts, type TodoAlert } from '../../utils/todoAlerts'

/** Live-computed operational alerts (low stock / due-date risk / production overrun) — never stored. */
export function useTodoAlerts(): TodoAlert[] {
  const { data: rawData } = useQuery({ queryKey: ['raw-materials'], queryFn: rawMaterialsApi.list, refetchInterval: 20000 })
  const articles = articlesApi.list()
  const projects = projectsApi.list()

  return useMemo<TodoAlert[]>(() => {
    const grades = gradesApi.listSync()
    const profiles = profilesApi.listSync()
    const machines = machinesApi.listSync()
    return [
      ...getLowStockAlerts(rawData?.data ?? []),
      ...getDueRiskAlerts(projects),
      ...getProductionOverrunAlerts(projects, articles, { grades, profiles, machines }),
    ]
  }, [rawData, projects, articles])
}
