import { flushPendingEditsV1 } from '../../lib/authoring/pending-edit-coordinator';
import { useCallback, useEffect, useState } from 'react';
import { GitBranch, Loader2, Rocket, ShieldCheck } from 'lucide-react';
import type { WorldRelease, WorldRevision, WorkspaceScope } from '../../lib/types';
import type { WorldReleaseSection } from '../../lib/registry/types';
import { resolveScopeLike } from '../../lib/workspace/scope';
import { createWorldRevision, diffWorldRevisions, listWorldReleases, listWorldRevisions, publishWorldRevision, WORLD_RELEASE_SECTIONS, worldReleaseSectionTables } from '../../lib/world-engine/releases';
import { useDialog } from '../shared/Dialog';
import NarrativeCompilationPanel from './NarrativeCompilationPanel'

interface Props {
  projectId: number
  activeWorkId?: number | null
  onChanged: () => Promise<void> | void
}

export default function WorldNarrativeReleasePanel({
  projectId,
  activeWorkId,
  onChanged,
}: Props) {
  const dialog = useDialog()
  const [scope, setScope] = useState<WorkspaceScope | null>(null)
  const [revisions, setRevisions] = useState<WorldRevision[]>([])
  const [releases, setReleases] = useState<WorldRelease[]>([])
  const [revisionLabel, setRevisionLabel] = useState('')
  const [selectedRevisionId, setSelectedRevisionId] = useState<number | null>(null)
  const [selectedSections, setSelectedSections] = useState<Set<WorldReleaseSection>>(
    () => new Set(WORLD_RELEASE_SECTIONS.map(section => section.key)),
  )
  const [revisionDiff, setRevisionDiff] = useState<{
    added: string[]
    removed: string[]
    changed: string[]
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const narrativePreview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('narrative-preview')

  const load = useCallback(async () => {
    const resolved = await resolveScopeLike(projectId)
    const [revisionRows, releaseRows] = await Promise.all([
      listWorldRevisions(resolved),
      listWorldReleases(resolved),
    ])
    setScope(resolved)
    setRevisions(revisionRows)
    setSelectedRevisionId(previous => revisionRows.some(row => row.id === previous) ? previous : revisionRows[0]?.id ?? null)
    setReleases(releaseRows)
    setRevisionDiff(revisionRows.length > 1
      ? await diffWorldRevisions(revisionRows[1].id!, revisionRows[0].id!)
      : null)
  }, [projectId])

  useEffect(() => {
    void load().catch(cause => setMessage(cause instanceof Error ? cause.message : '读取世界版本失败'))
  }, [activeWorkId, load])

  const latestRevision = revisions[0] ?? null
  const latestRelease = releases[0] ?? null
  const selectedRevision = revisions.find(row => row.id === selectedRevisionId) ?? null

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await flushPendingEditsV1()
      await action()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const createRevision = () => run(async () => {
    if (!scope || selectedSections.size === 0) return
    const created = await createWorldRevision({
      scope,
      label: revisionLabel,
      parentRevisionId: latestRevision?.id ?? null,
      selectedTables: [...selectedSections].flatMap(section => worldReleaseSectionTables(section)),
    })
    setSelectedRevisionId(created.id!)
    setRevisionLabel('')
    setMessage('已冻结新的纯语义世界修订；上层产品、媒资和运行状态均未进入。')
    await load()
  })

  const publish = () => run(async () => {
    if (!selectedRevision?.id) return
    const confirmed = await dialog.confirm({
      title: `发布修订 ${selectedRevision.revision}？`,
      message: '发布后该 WorldRelease 保持不可变；后续草稿修改只会进入新修订。',
      confirmText: '发布世界版本',
    })
    if (!confirmed) return
    await publishWorldRevision(selectedRevision.id)
    setMessage('不可变的世界版本已发布，可在数据出口查看。')
    await load()
    await onChanged()
  })

  return (
    <section className="sf-world-pipeline" aria-label="世界修订与封存">
      <div className="sf-world-pipeline-heading">
        <div>
          <span className="sf-card-kicker"><GitBranch className="h-4 w-4" /> SEMANTIC WORLD RELEASE</span>
          <h3>冻结并封存世界版本</h3>
        </div>
        <span className="sf-project-status"><ShieldCheck className="h-3.5 w-3.5" />世界版本发布后保持不可变</span>
      </div>

      <div className="sf-world-pipeline-grid">
        <div className="sf-world-pipeline-stage">
          <div className="sf-world-pipeline-stage-head"><span>1</span><div><strong>选择语义范围</strong><small>选择希望在这个版本中分享的内容</small></div></div>
          <fieldset className="sf-world-release-sections">
            <legend>封存范围</legend>
            {WORLD_RELEASE_SECTIONS.map(section => (
              <label key={section.key} title={section.description}>
                <input
                  type="checkbox"
                  checked={selectedSections.has(section.key)}
                  onChange={event => setSelectedSections(previous => {
                    const next = new Set(previous)
                    if (event.target.checked) next.add(section.key)
                    else next.delete(section.key)
                    return next
                  })}
                />
                <span>{section.label}</span>
              </label>
            ))}
          </fieldset>
          <label className="sf-world-pipeline-field">修订名称<input value={revisionLabel} onChange={event => setRevisionLabel(event.target.value)} placeholder={`例如：世界修订 ${revisions.length + 1}`} /></label>
          <label className="sf-world-pipeline-field">待发布修订<select value={selectedRevisionId ?? ''} onChange={event=>setSelectedRevisionId(Number(event.target.value)||null)}><option value="">选择冻结修订</option>{revisions.map(row=><option key={row.id} value={row.id}>修订 {row.revision} · {row.label}</option>)}</select></label>
          <div className="sf-world-pipeline-actions">
            {!narrativePreview && <button className="sf-button sf-button-secondary" onClick={createRevision} disabled={!scope || busy || selectedSections.size === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}冻结修订
            </button>}
            <button className="sf-button sf-button-primary" onClick={publish} disabled={busy || !selectedRevision?.id || releases.some(release=>release.revisionId === selectedRevision.id)}>
              <Rocket className="h-4 w-4" />发布版本
            </button>
          </div>
          {narrativePreview && scope && <NarrativeCompilationPanel scope={scope}
            selectedTables={[...selectedSections].flatMap(section => worldReleaseSectionTables(section, 4))}
            label={revisionLabel} parentRevisionId={latestRevision?.id ?? null} revisions={revisions} disabled={busy}
            onSealed={async revision => { setSelectedRevisionId(revision.id!); setRevisionLabel(''); await load() }} />}
          <div className="sf-world-pipeline-status"><span>修订 {revisions.length}</span><span>发布 {releases.length}</span>{latestRelease && <span>当前 v{latestRelease.version}</span>}</div>
          {revisionDiff && <div className="sf-world-revision-diff" role="region" aria-label="最新修订差异">
            <strong>最新修订相对修订 {revisions[1]?.revision}（数据表计数）</strong>
            <span>新增 {revisionDiff.added.length}</span>
            <span>变更 {revisionDiff.changed.length}</span>
            <span>移除 {revisionDiff.removed.length}</span>
          </div>}
        </div>
      </div>
      {message && <p className="sf-product-message" role="status">{message}</p>}
    </section>
  )
}
