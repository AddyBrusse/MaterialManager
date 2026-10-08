/**
 * "De planning is veranderd" tussen vensters (2026-10-08). Het werkbord kan in
 * een eigen venster staan; dat heeft zijn eigen kopie van de projecten en
 * ververst elke 10 s. Dit sein laat het andere venster meteen verversen na
 * een herberekening of ongedaan maken, in plaats van tot tien seconden later.
 */
const KANAAL = 'sm_planning'

export function seinPlanning(): void {
  try {
    const bc = new BroadcastChannel(KANAAL)
    bc.postMessage('veranderd')
    bc.close()
  } catch { /* geen BroadcastChannel: de volgende verversronde haalt het op */ }
}

export function opPlanningSein(cb: () => void): () => void {
  try {
    const bc = new BroadcastChannel(KANAAL)
    bc.onmessage = () => cb()
    return () => bc.close()
  } catch {
    return () => {}
  }
}
