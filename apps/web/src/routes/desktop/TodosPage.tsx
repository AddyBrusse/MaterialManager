import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { todosApi, isVerbeterpunt } from '../../api/todos'
import { TakenTab } from '../../components/todos/TakenTab'
import { VerbeterpuntenTab } from '../../components/verbeterpunt/VerbeterpuntenTab'

/**
 * Twee lijsten op één pagina (2026-10-24): het werk van de werkplaats, en wat
 * iemand met "Dit klopt niet" over het programma zelf meldde. Gescheiden zodat
 * "kolomkop klopt niet" niet tussen "bestel Ø50 rond" staat.
 */
export function TodosPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'verbeterpunten' ? 'verbeterpunten' : 'taken'

  const { data } = useQuery({
    queryKey: ['todos'],
    queryFn: todosApi.list,
    refetchInterval: 20000,
  })
  const todos = data?.data ?? []
  const taken = todos.filter(t => !isVerbeterpunt(t))
  const punten = todos.filter(isVerbeterpunt)
  const open = (lijst: typeof todos) => lijst.filter(t => !t.done).length

  return (
    <div style={{ padding: 24 }}>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Todo lijst</div>
          <div className="st-page-sub">Gedeelde takenlijst voor de werkplaats</div>
        </div>
      </div>

      <div className="st-tabs" style={{ padding: 0, marginTop: 12 }}>
        <button className={`st-tab-btn${tab === 'taken' ? ' active' : ''}`} onClick={() => setParams({}, { replace: true })}>
          Taken <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>({open(taken)})</span>
        </button>
        <button
          className={`st-tab-btn${tab === 'verbeterpunten' ? ' active' : ''}`}
          onClick={() => setParams({ tab: 'verbeterpunten' }, { replace: true })}
        >
          Verbeterpunten <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>({open(punten)})</span>
        </button>
      </div>

      {tab === 'taken' ? <TakenTab todos={taken} /> : <VerbeterpuntenTab punten={punten} />}
    </div>
  )
}
