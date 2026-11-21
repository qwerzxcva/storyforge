/** A stage recap reads the current whole-party intersection, independent of any narration operation. */
import type { WorkspaceScope } from '../../types/index';
import { canonicalStringify, hashCanonicalValue } from '../../agent/run/hash';
import { loadTtrpgOpenMemoryReadStateV1 } from './open-memory-read-state';
import { loadTtrpgOpenCommonProjectionV1 } from './open-player-context';
import { TtrpgOpenReadConflictV1 } from './open-read-conflict';

import { type TtrpgOpenBriefReliabilityV1, type TtrpgOpenBriefEntryKindV1 } from './open-brief-contract';
export interface TtrpgOpenBriefInputEntryV1 {
  sourceKey: string
  kind: TtrpgOpenBriefEntryKindV1
  reliability: TtrpgOpenBriefReliabilityV1
  observerKey: string | null
  value: unknown
}

type BriefReadInput = { scope: WorkspaceScope; sessionId: number; actorKey: string }
export async function loadTtrpgOpenBriefContextV1(input: BriefReadInput) { return (await loadBriefReadModel(input)).context }
async function loadBriefReadModel(input: BriefReadInput) {
  if (input.actorKey !== 'gm') throw new Error('[ttrpg-brief] 复盘只能读取明确的全队共同视图')
  const loaded = await loadTtrpgOpenMemoryReadStateV1({ ...input, reader: { kind: 'party' } })
  const { state, stateHash, runtime, authorization, source } = loaded, run = runtime.openRun!
  const recipients = [...authorization.selectedActorKeys].sort()
  const common = await loadTtrpgOpenCommonProjectionV1(input)
  if (common.readEvidence.sequence !== state.lastSequence || common.readEvidence.stateHash !== stateHash
    || common.readEvidence.runtimeSourceHash !== source.runtimeSourceHash || canonicalStringify(common.recipientActorKeys) !== canonicalStringify(recipients)) {
    throw new TtrpgOpenReadConflictV1('读取复盘资料期间团局或接收者已经变化')
  }
  const { initialObservations: initial, knowledge, sessionFacts: facts, pressureSignals: signals, actorsHere: actors } = common.view
  const values: Array<Omit<TtrpgOpenBriefInputEntryV1, 'sourceKey'> & { prefix: string }> = [
    ...initial.map(value => ({ prefix: 'initial', kind: 'release-observation' as const, reliability: 'release-time' as const, observerKey: null, value })),
    ...knowledge.map(value => ({ prefix: 'knowledge', kind: 'known-evidence' as const, reliability: value.reliability, observerKey: null, value })),
    ...facts.map(value => ({ prefix: 'fact', kind: 'confirmed-session-fact' as const, reliability: 'confirmed' as const, observerKey: null, value })),
    ...signals.map(value => ({ prefix: 'signal', kind: 'published-telegraph' as const, reliability: 'observed' as const, observerKey: null, value })),
  ]
  for (const narration of run.narrations ?? []) {
    if (!recipients.every(key => narration.recipientActorKeys.includes(key))) continue
    values.push({ prefix: 'narration', kind: 'retained-narration', reliability: 'narrated', observerKey: 'gm', value: {
      sourceRef: narration.sourceRef, origin: 'sourceKind' in narration ? 'human-authored' : 'model-reviewed',
      paragraphs: narration.narration.paragraphs.map(p => p.text), noMechanicalAuthority: true, noKnowledgeGrant: true } })
  }
  const entries: TtrpgOpenBriefInputEntryV1[] = []
  for (const { prefix, ...value } of values) {
    const sourceKey = `${prefix}.${await hashCanonicalValue(value)}`
    if (!entries.some(entry => entry.sourceKey === sourceKey)) entries.push({ sourceKey, ...value })
  }
  const frame = { schema: 'storyforge.ttrpg-open-brief-frame', version: 1,
    stage: { ...run.stage }, worldTurn: run.worldTime.worldTurn, recipientActorKeys: recipients, actors,
    currentSnapshotIsNotAnEventTranscript: true }
  const contract = { schema: 'storyforge.ttrpg-open-brief-contract', version: 1, consumer: 'party-narrator',
    noMechanicalAuthority: true, noKnowledgeGrant: true, noWorldWrite: true, noPlayerDecision: true,
    keepOriginalReliabilityAndObserver: true, citationsOnlyFromDeliveredResources: true,
    releaseObservationsAreNotCurrentState: true, narrationIsNotConfirmedFact: true,
    output: { paragraphs: [{ text: '复盘文字', sourceKeys: ['brief.frame'] }] } }
  const resources = [
    { suffix: 'brief-contract', title: '共同复盘的来源与可靠性合同', mandatory: true, value: contract },
    { suffix: 'brief-frame', title: '当前阶段与实际共同接收者', mandatory: true, value: frame },
    ...entries.map(entry => ({ suffix: `brief-entry.${entry.sourceKey}`, title: `共同复盘来源 · ${entry.kind}`, mandatory: false,
      value: { schema: 'storyforge.ttrpg-open-brief-entry', version: 1, entry } })),
  ]
  await loaded.assertCurrent()
  return { loaded, context: { resources, entries, frame, visibilityHash: await hashCanonicalValue({ frame, entries }),
    admissionStateHash: await hashCanonicalValue({ stage: frame.stage, recipients, entries }),
    predicateFacts: { worldFacts: initial, sessionFacts: facts },
    readEvidence: { sequence: state.lastSequence, stateHash, runtimeSourceHash: source.runtimeSourceHash, sessionKey: runtime.sessionKey } } }
}
