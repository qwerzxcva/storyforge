import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import type { CreationReleaseV1, Project, WorkspaceScope } from '../../lib/types';
import { resolveScope } from '../../lib/workspace/scope';
import { listLegacyCreationReleasesV1, readLegacyCreationManifestV1, renderLegacyCreationV1, type LegacyCreationFormat } from '../../lib/longform/legacy-creation-history';

export default function LegacyCreationHistory({ project }: { project: Project }) {
  const [state, setState] = useState<{ scope: WorkspaceScope; rows: CreationReleaseV1[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const scope = await resolveScope({ projectId: project.id! })
      return { scope, rows: await listLegacyCreationReleasesV1(scope) }
    }).subscribe({
      next: value => { setState(value); setError('') },
      error: cause => setError(String(cause)),
    })
    return () => subscription.unsubscribe()
  }, [project.id])

  const download = async (row: CreationReleaseV1, format: LegacyCreationFormat) => {
    if (!state || row.id == null) return
    setError('')
    try {
      const manifest = await readLegacyCreationManifestV1(state.scope, row.id)
      const body = renderLegacyCreationV1(manifest, format)
      const url = URL.createObjectURL(new Blob([body], {
        type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8',
      }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${manifest.work.title.replace(/[\\/:*?"<>|]/g, '_')}-短篇-v${row.version}.${format}`
      try { link.click() }
      finally { setTimeout(() => URL.revokeObjectURL(url), 1000) }
    } catch (cause) {
      setError(String(cause))
    }
  }

  if (!state?.rows.length && !error) return null
  return <details className="lf-paper">
    <summary>扩写前的短篇版本</summary>
    <p>这些版本保留发布时的短篇内容，后续长篇修改不会改变它们。</p>
    {state?.rows.map(row => <div key={row.id}>
      <strong>{row.label}</strong>
      {(['md', 'txt', 'json'] as const).map(format => <button className="lf-action" key={format} onClick={() => void download(row, format)}>
        下载 {format.toUpperCase()}
      </button>)}
    </div>)}
    {error && <p role="alert">{error}</p>}
  </details>
}
