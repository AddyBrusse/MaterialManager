import type { AandachtVM, TodoVM } from '../types'
import { AandachtBox } from '../sidebar/AandachtBox'
import { TodoBox } from '../sidebar/TodoBox'
import { Card } from '../components/Card'

/**
 * Aandachtspunten en openstaande todo's, als eigen tab.
 *
 * Beide kaarten verdwijnen vanzelf zodra ze leeg zijn — dat was goed gedrag in
 * een zijkolom, maar een tab die je opent en die dan niets toont is een
 * mislukking. Vandaar hier de lege staat eromheen: als er niets is, staat
 * er dát er niets is.
 *
 * Aandacht en todo's staan naast elkaar omdat ze dezelfde vraag beantwoorden —
 * wat moet ik met dit project — maar niet dezelfde herkomst hebben: aandacht
 * wordt afgeleid (`lib/aandacht.ts`), een todo is door iemand gemaakt.
 */
export function AandachtTab({ aandacht, todos }: { aandacht: AandachtVM[]; todos: TodoVM[] }) {
  if (aandacht.length === 0 && todos.length === 0) {
    return (
      <Card titel="Aandacht">
        <div className="pdv2-empty">
          Niets dat aandacht vraagt, en geen openstaande todo’s op dit project.
        </div>
      </Card>
    )
  }

  return (
    <div className="pdv2-twee">
      <AandachtBox items={aandacht} />
      <TodoBox items={todos} />
    </div>
  )
}
