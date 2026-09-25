import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { initMachines } from '../api/machines'
import { initRelaties } from '../api/relaties'
import { initArticles } from '../api/articles'
import { initProjects } from '../api/projects'
import { initGrades } from '../api/grades'
import { initProfiles } from '../api/profiles'
import { loadCompany } from '../api/company'
import { laadGevolg, type LaadFout } from '../utils/fout-melding'
import { meldFout } from '../utils/fout-melding-toon'

// Shared by AppLayout (main window) and PopoutShell (detached windows) —
// each is its own separate page load / React tree, so each needs to run
// this same startup fetch once on mount.
export function useInitAppData(): void {
  const qc = useQueryClient()

  useEffect(() => {
    // Populate all in-memory caches from API on startup. These modules expose
    // a synchronous list()/listSync() read of an in-memory cache that starts
    // out seeded from localStorage (or hardcoded mock defaults) — pages that
    // read it via useQuery get that stale snapshot immediately on mount, and
    // nothing tells them to re-render once the real fetch below resolves.
    // Invalidate every query relying on these caches so they pick up the
    // real DB data as soon as it's in, instead of getting stuck showing
    // whatever was cached/seeded before this load.
    Promise.all([
      initMachines(),
      initRelaties(),
      initArticles(),
      initProjects(),
      initGrades(),
      initProfiles(),
      loadCompany(),
    ]).then((uitkomsten) => {
      // Eén melding voor alles wat niet laadde. Valt de server weg, dan falen
      // ze allemaal met dezelfde oorzaak; de eerste fout zegt dan wat en waar.
      const fouten = uitkomsten.filter((u): u is LaadFout => !!u && typeof u === 'object' && 'wat' in u)
      if (fouten.length > 0) {
        meldFout({ actie: 'Gegevens laden', fout: fouten[0].fout, gevolg: laadGevolg(fouten) })
      }
      qc.invalidateQueries({ queryKey: ['machines'] })
      qc.invalidateQueries({ queryKey: ['relaties'] })
      qc.invalidateQueries({ queryKey: ['articles'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['grades'] })
      qc.invalidateQueries({ queryKey: ['profiles'] })
      qc.invalidateQueries({ queryKey: ['company'] })
    })
  }, [qc])
}
