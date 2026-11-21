import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../../lib/db/schema';
import { readHomeCatalog } from '../../lib/home/catalog';

export async function readHomeData() {
  const [catalog, runs, imports, releases] = await Promise.all([
    readHomeCatalog(), db.agentRuns.toArray(), db.importJobs.toArray(), db.creationReleases.toArray(),
  ])
  return {
    ...catalog,
    runs: runs.filter(run => !run.productRuntimeSessionId && catalog.rows.some(({ work }) =>
      work.id === run.workId && work.projectId === run.projectId,
    )).sort((a, b) => b.updatedAt - a.updatedAt),
    imports: imports.filter(job => catalog.projects.some(project => project.id === job.projectId))
      .sort((a, b) => b.updatedAt - a.updatedAt),
    releases: releases.filter(release => catalog.rows.some(({ work }) =>
      work.id === release.workId && work.projectId === release.projectId && work.worldId === release.worldId,
    )).sort((a, b) => b.createdAt - a.createdAt),
  }
}

export type HomeData = Awaited<ReturnType<typeof readHomeData>>

export function useHomeData() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const subscription = liveQuery(readHomeData).subscribe({
      next: value => { setData(value); setError('') },
      error: cause => setError(String(cause)),
    })
    return () => subscription.unsubscribe()
  }, [])
  return { data, error }
}
