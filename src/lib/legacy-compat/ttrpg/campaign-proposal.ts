import type { TtrpgCampaignDesignV2, TtrpgCampaignProposalSectionV2, TtrpgCampaignProposalV2 } from '../../types/index';
import { isSha256Hash } from '../product-production/hash';

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
export const TTRPG_CAMPAIGN_PROPOSAL_SECTIONS_V2 = [
  'background', 'coreConflict', 'opening', 'fronts', 'secrets', 'endings',
] as const satisfies readonly TtrpgCampaignProposalSectionV2[]

function fail(message: string): never { throw new Error(`[ttrpg-campaign-proposal] ${message}`) }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须是对象`)
  return value as Record<string, unknown>
}
function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} 字段不精确:${actual.join(',')}`)
}
function text(value: unknown, label: string, maximum = 10_000, allowEmpty = false): string {
  if (typeof value !== 'string') fail(`${label} 必须是字符串`)
  const parsed = value.trim().normalize('NFC')
  if ((!allowEmpty && !parsed) || parsed.length > maximum) fail(`${label} 为空或过长`)
  return parsed
}
function key(value: unknown, label: string): string {
  const parsed = text(value, label, 200)
  if (!KEY.test(parsed)) fail(`${label} 不是稳定 key`)
  return parsed
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} 必须是 boolean`)
  return value
}
function texts(value: unknown, label: string, minimum = 0, maximum = 20): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(`${label} 数量无效`)
  const parsed = value.map((item, index) => text(item, `${label}[${index}]`, 2_000))
  if (new Set(parsed).size !== parsed.length) fail(`${label} 不允许重复`)
  return parsed
}

function parseProposal(value: unknown, index: number): TtrpgCampaignProposalV2 {
  const row = record(value, `proposals[${index}]`)
  exact(row, [
    'proposalKey', 'title', 'pitch', 'background', 'coreConflict', 'structure', 'opening',
    'frontConcepts', 'secretConcepts', 'endingConcepts', 'sourceRefs',
  ], `proposals[${index}]`)
  const structure = text(row.structure, 'proposal.structure', 40)
  if (!['linear', 'branching', 'node-based', 'sandbox'].includes(structure)) fail('proposal.structure 枚举无效')
  const sourceRefs = texts(row.sourceRefs, 'proposal.sourceRefs', 1, 100)
  sourceRefs.forEach((source, sourceIndex) => key(source, `proposal.sourceRefs[${sourceIndex}]`))
  return {
    proposalKey: key(row.proposalKey, 'proposal.proposalKey'),
    title: text(row.title, 'proposal.title', 300), pitch: text(row.pitch, 'proposal.pitch', 2_000),
    background: text(row.background, 'proposal.background'), coreConflict: text(row.coreConflict, 'proposal.coreConflict'),
    structure: structure as TtrpgCampaignProposalV2['structure'], opening: text(row.opening, 'proposal.opening'),
    frontConcepts: texts(row.frontConcepts, 'proposal.frontConcepts', 1, 8),
    secretConcepts: texts(row.secretConcepts, 'proposal.secretConcepts', 1, 12),
    endingConcepts: texts(row.endingConcepts, 'proposal.endingConcepts', 2, 8), sourceRefs,
  }
}

export function parseTtrpgCampaignDesignV2(value: unknown): TtrpgCampaignDesignV2 {
  const row = record(value, 'campaignDesign')
  exact(row, ['schema', 'version', 'origin', 'sourceWorldContentHash', 'proposals', 'selection', 'candidateEvidence'], 'campaignDesign')
  if (row.schema !== 'storyforge.ttrpg-campaign-design' || row.version !== 2) fail('schema/version 无效')
  const origin = text(row.origin, 'origin', 40)
  if (!['author-guided', 'ai-candidate'].includes(origin)) fail('origin 无效')
  if (!isSha256Hash(row.sourceWorldContentHash)) fail('sourceWorldContentHash 无效')
  if (!Array.isArray(row.proposals) || row.proposals.length < 2 || row.proposals.length > 3) fail('必须有 2～3 个战役提案')
  const proposals = row.proposals.map(parseProposal)
  const proposalKeys = proposals.map(proposal => proposal.proposalKey)
  if (new Set(proposalKeys).size !== proposalKeys.length) fail('proposalKey 重复')
  const selection = record(row.selection, 'selection')
  exact(selection, ['baseProposalKey', 'sectionSources', 'lockedSections', 'authorNotes', 'confirmed'], 'selection')
  const baseProposalKey = key(selection.baseProposalKey, 'selection.baseProposalKey')
  if (!proposalKeys.includes(baseProposalKey)) fail('baseProposalKey 不属于提案集')
  const sectionSourcesRow = record(selection.sectionSources, 'selection.sectionSources')
  exact(sectionSourcesRow, TTRPG_CAMPAIGN_PROPOSAL_SECTIONS_V2, 'selection.sectionSources')
  const sectionSources = Object.fromEntries(TTRPG_CAMPAIGN_PROPOSAL_SECTIONS_V2.map(section => {
    const proposalKey = key(sectionSourcesRow[section], `selection.sectionSources.${section}`)
    if (!proposalKeys.includes(proposalKey)) fail(`sectionSources.${section} 不属于提案集`)
    return [section, proposalKey]
  })) as Record<TtrpgCampaignProposalSectionV2, string>
  const lockedSections = texts(selection.lockedSections, 'selection.lockedSections', 0, TTRPG_CAMPAIGN_PROPOSAL_SECTIONS_V2.length)
    .map(section => {
      if (!TTRPG_CAMPAIGN_PROPOSAL_SECTIONS_V2.includes(section as TtrpgCampaignProposalSectionV2)) fail(`未知锁定分区:${section}`)
      return section as TtrpgCampaignProposalSectionV2
    })
  let candidateEvidence: TtrpgCampaignDesignV2['candidateEvidence'] = null
  if (row.candidateEvidence != null) {
    const evidence = record(row.candidateEvidence, 'candidateEvidence')
    exact(evidence, ['runId', 'candidateHash', 'contextManifestHash'], 'candidateEvidence')
    if (!Number.isInteger(evidence.runId) || Number(evidence.runId) < 1
      || !isSha256Hash(evidence.candidateHash) || !isSha256Hash(evidence.contextManifestHash)) fail('candidateEvidence 无效')
    candidateEvidence = { runId: Number(evidence.runId), candidateHash: String(evidence.candidateHash), contextManifestHash: String(evidence.contextManifestHash) }
  }
  if ((origin === 'ai-candidate') !== (candidateEvidence != null)) fail('AI 提案与 durable candidate evidence 不闭合')
  return {
    schema: 'storyforge.ttrpg-campaign-design', version: 2,
    origin: origin as TtrpgCampaignDesignV2['origin'], sourceWorldContentHash: String(row.sourceWorldContentHash),
    proposals, selection: {
      baseProposalKey, sectionSources, lockedSections,
      authorNotes: text(selection.authorNotes, 'selection.authorNotes', 4_000, true),
      confirmed: bool(selection.confirmed, 'selection.confirmed'),
    },
    candidateEvidence,
  }
}
