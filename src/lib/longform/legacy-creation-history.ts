import { parseAndVerifyCreationReleaseManifestV1 } from '../creation-release/contracts';
import { db } from '../db/schema';
import type { CreationReleaseV1, WorkspaceScope } from '../types';
import { htmlToPlainText } from '../utils/html';

type LegacyManifest = Record<string, unknown> & {
  work: { title: string }
  chapters: { title: string; contentHtml: string }[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasReadableManuscript(manifest: Record<string, unknown>): manifest is LegacyManifest {
  return isRecord(manifest.work) && typeof manifest.work.title === 'string'
    && Array.isArray(manifest.chapters) && manifest.chapters.every(chapter =>
      isRecord(chapter) && typeof chapter.title === 'string' && typeof chapter.contentHtml === 'string',
    )
}

function matchesScope(release: CreationReleaseV1, scope: WorkspaceScope): boolean {
  return release.productKind === 'short-novel' && release.projectId === scope.projectId
    && release.worldId === scope.worldId && release.workId === scope.workId
}

export async function listLegacyCreationReleasesV1(scope: WorkspaceScope): Promise<CreationReleaseV1[]> {
  return (await db.creationReleases.where('workId').equals(scope.workId).toArray())
    .filter(row => matchesScope(row, scope))
    .sort((left, right) => right.version - left.version)
}

export async function readLegacyCreationManifestV1(scope: WorkspaceScope, releaseId: number): Promise<LegacyManifest> {
  const release = await db.creationReleases.get(releaseId)
  if (!release || !matchesScope(release, scope)) throw new Error('历史版本不存在或超出当前作品范围。')
  const work = await db.works.get(scope.workId)
  if (!work || work.projectId !== scope.projectId || work.worldId !== scope.worldId) {
    throw new Error('历史版本所属作品不存在或超出当前世界范围。')
  }
  const manifest: Record<string, unknown> = await parseAndVerifyCreationReleaseManifestV1(release, work.code)
  if (!isRecord(manifest.production) || manifest.production.revision !== release.sourceRevision) {
    throw new Error('历史版本的来源修订不一致。')
  }
  if (!hasReadableManuscript(manifest)) throw new Error('历史版本的正文结构无效。')
  return manifest
}

export type LegacyCreationFormat = 'md' | 'txt' | 'json'

export function renderLegacyCreationV1(manifest: LegacyManifest, format: LegacyCreationFormat): string {
  if (format === 'json') return JSON.stringify(manifest, null, 2)
  const markdown = format === 'md'
  const parts = [markdown ? `# ${manifest.work.title}` : manifest.work.title, '']
  for (const chapter of manifest.chapters) {
    const text = htmlToPlainText(chapter.contentHtml)
    const body = markdown ? text.split(/\n+/).map(paragraph => paragraph.trim()).filter(Boolean).join('\n\n') : text
    parts.push(markdown ? `## ${chapter.title}` : chapter.title, '', body, '')
  }
  return parts.join('\n').trim()
}
