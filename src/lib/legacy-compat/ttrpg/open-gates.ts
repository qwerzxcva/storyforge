import type { TtrpgCampaignContentV2, TtrpgOpenCampaignFrontV1, TtrpgOpenStageClosurePolicyV1, TtrpgPredicateV1, TtrpgSituationTemplateV1 } from './open-contract';
import { closurePolicy } from './open-content-templates';
import type { TtrpgSituationInstanceV1 } from './situation-engine';
import { evaluateTtrpgPredicateV1 } from './predicate';
import type { TtrpgPredicateEvaluationContextV1 } from './predicate';
import { parseTtrpgPressureClockV1, parseTtrpgPressureFrontV1 } from './pressure-runtime';
import type { TtrpgPressureFrontStateV1 } from './pressure-runtime';
import type { TtrpgSessionFactV1 } from './session-facts';
import { parseTtrpgSessionFactV1 } from './session-facts';
import * as p from './open-contract-parse'

export const TTRPG_OPEN_GATE_KEYS = [
  'exit-exists',
  'hypothesis-formable',
  'telegraph-complete',
  'facts-consistent',
] as const

export type TtrpgOpenGateKeyV1 = typeof TTRPG_OPEN_GATE_KEYS[number]
export type TtrpgOpenGateApplicabilityV1 = 'applicable' | 'not-applicable'
export type TtrpgOpenGateRecoveryV1 = 'none' | 'request-author-review'

export interface TtrpgOpenGateResultV1 {
  applicability: TtrpgOpenGateApplicabilityV1
  passed: boolean | null
  evidence: string[]
  viewerKey: string | null
  stageRevision: string
  evaluationBasisHash: string | null
}

export interface TtrpgOpenRuntimeGateInputV1 {
  campaign?: Partial<TtrpgCampaignContentV2> | null
  openRun?: Record<string, unknown> | null
  predicateContext?: TtrpgPredicateEvaluationContextV1
  viewer?: { actorKey?: string | null; viewerKey?: string | null; audience?: 'player' | 'party' | 'public' }
  viewerKey?: string | null
  actorKey?: string | null
  stage?: { status?: 'active' | 'closed' | 'paused'; revision?: string | number } | null
  stageStatus?: 'active' | 'closed' | 'paused'
  stageRevision?: string | number
  evaluationBasisHash?: string | null
  consecutiveFailures?: Partial<Record<TtrpgOpenGateKeyV1, number>>
  previousGateResults?: Partial<Record<TtrpgOpenGateKeyV1, TtrpgOpenGateResultV1>>
  sessionFacts?: readonly TtrpgSessionFactV1[]
  factGateInputs?: readonly Record<string, unknown>[]
  incrementalFactKeys?: readonly string[]
  [key: string]: unknown
}

export interface TtrpgOpenRuntimeGateEvaluationV1 {
  results: Record<TtrpgOpenGateKeyV1, TtrpgOpenGateResultV1>
  gates: Record<TtrpgOpenGateKeyV1, TtrpgOpenGateResultV1>
  consecutiveFailures: Record<TtrpgOpenGateKeyV1, number>
  recovery: Record<TtrpgOpenGateKeyV1, TtrpgOpenGateRecoveryV1>
  requestAuthorReview: TtrpgOpenGateKeyV1[]
  allApplicablePassed: boolean
  viewerKey: string | null
  stageRevision: string
  evaluationBasisHash: string | null
}

export interface TtrpgOpenStageClosureDecisionV1 {
  eligible: boolean
  reason: 'trigger' | 'maximum-world-turns' | 'not-eligible'
  triggerKey: string | null
  summaryPrompt: string | null
  maximumReached: boolean
  evidence: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`[ttrpg-open-gates] ${label}必须是对象`)
  return value
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function integer(value: unknown, label: string, minimum = 0): number {
  return p.integer(value, label, minimum)
}

function readRecord(root: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = root[key]
  return isRecord(value) ? value : null
}

function firstRecord(...values: unknown[]): Record<string, unknown> {
  for (const value of values) if (isRecord(value)) return value
  return {}
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function gateResult(
  passed: boolean | null,
  evidence: readonly string[],
  viewerKey: string | null,
  stageRevision: string,
  evaluationBasisHash: string | null,
  applicability: TtrpgOpenGateApplicabilityV1 = 'applicable',
): TtrpgOpenGateResultV1 {
  return {
    applicability,
    passed,
    evidence: [...evidence],
    viewerKey,
    stageRevision,
    evaluationBasisHash,
  }
}

function viewerActorKey(root: Record<string, unknown>): string | null {
  const viewer = readRecord(root, 'viewer')
  const value = root.actorKey ?? viewer?.actorKey
  return typeof value === 'string' && value.length > 0 ? value : null
}

function viewerKey(root: Record<string, unknown>): string | null {
  const viewer = readRecord(root, 'viewer')
  const value = root.viewerKey ?? viewer?.viewerKey ?? root.actorKey ?? viewer?.actorKey
  return typeof value === 'string' && value.length > 0 ? value : null
}

function stageStatus(root: Record<string, unknown>): 'active' | 'closed' | 'paused' {
  const stage = readRecord(root, 'stage')
  const value = root.stageStatus ?? stage?.status ?? 'active'
  if (value === 'closed' || value === 'paused') return value
  return 'active'
}

function stageRevision(root: Record<string, unknown>): string {
  const stage = readRecord(root, 'stage')
  const value = root.stageRevision ?? stage?.revision ?? 'stage.0'
  return String(value)
}

function evaluationBasisHash(root: Record<string, unknown>, campaign: Record<string, unknown>): string | null {
  const direct = root.evaluationBasisHash
  if (typeof direct === 'string') return direct
  const run = readRecord(root, 'openRun')
  const runHash = run?.evaluationBasisHash
  if (typeof runHash === 'string') return runHash
  const index = readRecord(campaign, 'frozenWorldPredicateIndex')
  return typeof index?.indexHash === 'string' ? index.indexHash : null
}

function activeSituationRows(root: Record<string, unknown>): TtrpgSituationInstanceV1[] {
  const run = readRecord(root, 'openRun')
  const situations = firstRecord(root.situations, run?.situations)
  return array(situations.active)
    .filter(isRecord)
    .filter(row => row.status === undefined || row.status === 'active')
    .map(row => ({
      situationKey: String(row.situationKey ?? ''),
      templateKey: String(row.templateKey ?? ''),
      status: 'active',
      activatedAtSequence: Number(row.activatedAtSequence ?? 0),
      activatedAtWorldTurn: Number(row.activatedAtWorldTurn ?? 0),
      activationReason: row.activationReason === 'front-escalation' || row.activationReason === 'consequence'
        ? row.activationReason : 'opening',
      whyNowRefs: array(row.whyNowRefs).filter((value): value is string => typeof value === 'string'),
      satisfiedObstacleKeys: array(row.satisfiedObstacleKeys).filter((value): value is string => typeof value === 'string'),
      discoveredEvidenceRefs: array(row.discoveredEvidenceRefs).filter((value): value is string => typeof value === 'string'),
      noInterventionDueWorldTurn: Number(row.noInterventionDueWorldTurn ?? 0),
      resolvedAtSequence: null,
      resolutionKind: null,
    }))
}

function campaignTemplates(campaign: Record<string, unknown>): TtrpgSituationTemplateV1[] {
  return array(campaign.situationTemplates).filter(isRecord) as unknown as TtrpgSituationTemplateV1[]
}

function predicateContext(
  root: Record<string, unknown>,
  campaign: Record<string, unknown>,
  active: readonly TtrpgSituationInstanceV1[],
): TtrpgPredicateEvaluationContextV1 | null {
  const raw = root.predicateContext
  if (!isRecord(raw)) return null
  const run = readRecord(root, 'openRun')
  const pressure = firstRecord(root.pressure, run?.pressure, raw.pressure)
  const templates = campaignTemplates(campaign)
  const rawContext = raw as unknown as TtrpgPredicateEvaluationContextV1
  const rawPressure = isRecord(raw.pressure) ? raw.pressure : {}
  const rawEffectLedger = isRecord(raw.effectLedger) ? raw.effectLedger : {}
  const rawStoryFacts = isRecord(rawEffectLedger.storyFacts) ? rawEffectLedger.storyFacts : {}
  const rawSocialBalances = isRecord(rawEffectLedger.socialBalances) ? rawEffectLedger.socialBalances : {}
  const rawActors = isRecord(raw.actors) ? raw.actors : {}
  const worldTurnValue = typeof root.worldTurn === 'number'
    ? root.worldTurn
    : typeof run?.worldTurn === 'number' ? run.worldTurn : rawContext.worldTurn
  return {
    ...rawContext,
    worldTurn: typeof worldTurnValue === 'number' ? worldTurnValue : 0,
    pressure: {
      ...rawPressure,
      clocks: firstRecord(pressure.clocks, rawPressure.clocks) as TtrpgPredicateEvaluationContextV1['pressure']['clocks'],
      fronts: firstRecord(pressure.fronts, rawPressure.fronts) as TtrpgPredicateEvaluationContextV1['pressure']['fronts'],
    } as TtrpgPredicateEvaluationContextV1['pressure'],
    situations: {
      active: active.map(instance => ({
        templateKey: instance.templateKey,
        discoveredEvidenceRefs: instance.discoveredEvidenceRefs,
      })),
      templates: templates.map(template => ({
        templateKey: template.templateKey,
        evidence: template.evidence.map(evidence => ({
          clueRef: evidence.clueRef,
          audience: evidence.audience,
          knownByActorKeys: evidence.knownByActorKeys,
        })),
      })),
    },
    sessionFacts: Array.isArray(rawContext.sessionFacts) ? rawContext.sessionFacts : [],
    frozenWorldPredicateIndex: rawContext.frozenWorldPredicateIndex
      ?? campaign.frozenWorldPredicateIndex as unknown as TtrpgPredicateEvaluationContextV1['frozenWorldPredicateIndex'],
    effectLedger: {
      storyFacts: rawStoryFacts as TtrpgPredicateEvaluationContextV1['effectLedger']['storyFacts'],
      socialBalances: rawSocialBalances as TtrpgPredicateEvaluationContextV1['effectLedger']['socialBalances'],
    },
    actors: rawActors as TtrpgPredicateEvaluationContextV1['actors'],
    chaos: typeof rawContext.chaos === 'number' ? rawContext.chaos : 0,
  }
}

function predicateValue(
  predicate: TtrpgPredicateV1,
  context: TtrpgPredicateEvaluationContextV1 | null,
): { value: boolean; error: string | null } {
  if (predicate === null || predicate === undefined) return { value: false, error: 'predicate为空' }
  if (!context) return { value: false, error: 'predicateContext缺失' }
  try {
    return { value: evaluateTtrpgPredicateV1(predicate, context), error: null }
  } catch (error) {
    return { value: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function pointVisibleToActor(
  point: TtrpgSituationTemplateV1['interventionPoints'][number],
  actorKey: string | null,
): boolean {
  if (point.visibleTo === 'party' || point.visibleTo === 'public') return true
  return actorKey !== null && point.visibleTo === 'private' && point.knownByActorKeys.includes(actorKey)
}

function evidenceKnownToActor(
  evidence: TtrpgSituationTemplateV1['evidence'][number],
  instance: TtrpgSituationInstanceV1,
  actorKey: string | null,
): boolean {
  if (instance.discoveredEvidenceRefs.includes(evidence.clueRef)) return true
  if (evidence.audience === 'party') return true
  return evidence.audience === 'private'
    && actorKey !== null
    && evidence.knownByActorKeys.includes(actorKey)
}

function transitiveDependencies(
  template: TtrpgSituationTemplateV1,
  obstacleKey: string,
): string[] {
  const byKey = new Map(template.obstacles.map(obstacle => [obstacle.obstacleKey, obstacle]))
  const result = new Set<string>()
  const pending = [...(byKey.get(obstacleKey)?.dependsOn ?? [])]
  while (pending.length > 0) {
    const current = pending.shift()!
    if (result.has(current)) continue
    result.add(current)
    pending.push(...(byKey.get(current)?.dependsOn ?? []))
  }
  return [...result]
}

function hypothesisFormable(
  template: TtrpgSituationTemplateV1,
  instance: TtrpgSituationInstanceV1,
  actorKey: string | null,
  context: TtrpgPredicateEvaluationContextV1 | null,
): { passed: boolean; evidence: string[] } {
  const covered = new Set(instance.satisfiedObstacleKeys)
  const knownEvidence = template.evidence.filter(evidence =>
    evidenceKnownToActor(evidence, instance, actorKey))
  for (const evidence of knownEvidence) {
    for (const obstacleKey of evidence.coversObstacleKeys) covered.add(obstacleKey)
  }
  const reasons: string[] = []
  for (const point of template.interventionPoints) {
    if (!pointVisibleToActor(point, actorKey)) continue
    const requires = point.requiresPredicate === null
      ? { value: true, error: null }
      : predicateValue(point.requiresPredicate, context)
    if (!requires.value) continue
    const missing = point.targetsObstacleKeys.flatMap(obstacleKey =>
      transitiveDependencies(template, obstacleKey).filter(dependency => !covered.has(dependency)))
    if (missing.length === 0) {
      reasons.push(`point=${point.pointKey}`)
      return { passed: true, evidence: reasons }
    }
  }
  return {
    passed: false,
    evidence: [
      `knownEvidence=${knownEvidence.length}`,
      `satisfiedObstacles=${instance.satisfiedObstacleKeys.length}`,
      'no-visible-intervention-with-covered-predecessors',
    ],
  }
}

function runtimePressure(
  root: Record<string, unknown>,
  campaign: Record<string, unknown>,
): {
  clocks: Record<string, { value: number }>
  fronts: Record<string, TtrpgPressureFrontStateV1 & { currentStageKey: string | null }>
} {
  const run = readRecord(root, 'openRun')
  const pressure = firstRecord(root.pressure, run?.pressure)
  const campaignClocks = array(campaign.clocks).filter(isRecord).map(parseTtrpgPressureClockV1)
  const campaignFronts = array(campaign.fronts).filter(isRecord).map(parseTtrpgPressureFrontV1)
  const clockSource = firstRecord(pressure.clocks)
  const clocks: Record<string, { value: number }> = {}
  for (const clock of campaignClocks) {
    const key = String(clock.clockKey ?? '')
    const state = readRecord(clockSource, key)
    const value = state && typeof state.value === 'number' ? state.value : Number(clock.initialValue ?? 0)
    clocks[key] = { value }
  }
  const frontSource = firstRecord(pressure.fronts)
  const fronts: Record<string, TtrpgPressureFrontStateV1 & { currentStageKey: string | null }> = {}
  for (const front of campaignFronts) {
    const key = String(front.frontKey ?? '')
    const state = readRecord(frontSource, key)
    fronts[key] = {
      currentStageKey: typeof state?.currentStageKey === 'string' ? state.currentStageKey : null,
      telegraphWorldTurns: firstRecord(state?.telegraphWorldTurns) as Record<string, number>,
      defeated: state?.defeated === true,
    }
  }
  return { clocks, fronts }
}

function gateG1(
  templates: readonly TtrpgSituationTemplateV1[],
  active: readonly TtrpgSituationInstanceV1[],
  actorKey: string | null,
  context: TtrpgPredicateEvaluationContextV1 | null,
): TtrpgOpenGateResultV1 {
  const evidence: string[] = []
  for (const instance of active) {
    const template = templates.find(candidate => candidate.templateKey === instance.templateKey)
    if (!template) {
      evidence.push(`missing-template=${instance.templateKey}`)
      continue
    }
    for (const point of template.interventionPoints) {
      if (!pointVisibleToActor(point, actorKey)) continue
      const predicate = point.requiresPredicate === null
        ? { value: true, error: null }
        : predicateValue(point.requiresPredicate, context)
      if (predicate.value) {
        return gateResult(true, [`situation=${instance.situationKey}`, `point=${point.pointKey}`], actorKey, '', null)
      }
      if (predicate.error) evidence.push(`${point.pointKey}:${predicate.error}`)
    }
  }
  return gateResult(false, [
    ...evidence,
    active.length === 0 ? 'active-situations=0' : 'no-visible-satisfied-intervention',
  ], actorKey, '', null)
}

function gateG2(
  templates: readonly TtrpgSituationTemplateV1[],
  active: readonly TtrpgSituationInstanceV1[],
  actorKey: string | null,
  context: TtrpgPredicateEvaluationContextV1 | null,
): TtrpgOpenGateResultV1 {
  for (const instance of active) {
    const template = templates.find(candidate => candidate.templateKey === instance.templateKey)
    if (!template) continue
    const result = hypothesisFormable(template, instance, actorKey, context)
    if (result.passed) return gateResult(true, [`situation=${instance.situationKey}`, ...result.evidence], actorKey, '', null)
  }
  return gateResult(false, [
    active.length === 0 ? 'active-situations=0' : 'no-formable-hypothesis',
  ], actorKey, '', null)
}

function gateG3(
  root: Record<string, unknown>,
  campaign: Record<string, unknown>,
): TtrpgOpenGateResultV1 {
  const pressure = runtimePressure(root, campaign)
  const worldTurnValue = readRecord(root, 'openRun')?.worldTurn ?? root.worldTurn ?? 0
  const worldTurn = typeof worldTurnValue === 'number' ? worldTurnValue : 0
  const failures: string[] = []
  let imminent = 0
  for (const rawFront of array(campaign.fronts)) {
    if (!isRecord(rawFront)) continue
    const front = rawFront as unknown as TtrpgOpenCampaignFrontV1
    const state = pressure.fronts[front.frontKey]
    if (!state || state.defeated) continue
    const currentIndex = state.currentStageKey === null
      ? -1
      : front.escalationStages.findIndex(stage => stage.stageKey === state.currentStageKey)
    const next = front.escalationStages[currentIndex + 1]
    if (!next) continue
    const clockValue = pressure.clocks[next.clockKey]?.value
    if (clockValue === undefined) {
      failures.push(`${front.frontKey}.${next.stageKey}:missing-clock=${next.clockKey}`)
      continue
    }
    if (clockValue < next.atClockValue - 1) continue
    imminent += 1
    const ready = front.telegraph
      .filter(telegraph => telegraph.beforeStageKey === next.stageKey)
      .some(telegraph => {
        const postedAt = state.telegraphWorldTurns[telegraph.telegraphKey]
        return typeof postedAt === 'number'
          && worldTurn - postedAt >= telegraph.minLeadWorldTurns
      })
    if (!ready) failures.push(`${front.frontKey}.${next.stageKey}:telegraph-not-ready`)
  }
  if (failures.length > 0) return gateResult(false, failures, null, '', null)
  return gateResult(true, [`imminentStages=${imminent}`, 'telegraph-lead-satisfied'], null, '', null)
}

function slotKey(subjectRef: string, predicateKey: string, objectRef: string | null): string {
  return JSON.stringify([subjectRef, predicateKey, objectRef])
}

function activeFactRows(root: Record<string, unknown>): TtrpgSessionFactV1[] {
  const run = readRecord(root, 'openRun')
  const source = root.sessionFacts ?? run?.sessionFacts ?? firstRecord(root.facts, run?.facts).items
  const rows: TtrpgSessionFactV1[] = []
  for (const value of array(source)) {
    if (!isRecord(value) || value.retired === true) continue
    try {
      rows.push(parseTtrpgSessionFactV1(value))
    } catch {
      // Runtime snapshots may intentionally contain only the mechanical fields.
      if (typeof value.subjectRef === 'string' && typeof value.predicateKey === 'string') {
        rows.push(value as unknown as TtrpgSessionFactV1)
      }
    }
  }
  return rows
}

function factConsistencyEvidence(
  facts: readonly TtrpgSessionFactV1[],
  campaign: Record<string, unknown>,
): string[] {
  const errors: string[] = []
  const bySlot = new Map<string, TtrpgSessionFactV1[]>()
  for (const fact of facts) {
    const key = slotKey(fact.subjectRef, fact.predicateKey, fact.objectRef ?? null)
    const bucket = bySlot.get(key) ?? []
    bucket.push(fact)
    bySlot.set(key, bucket)
  }
  const frozen = readRecord(campaign, 'frozenWorldPredicateIndex')
  for (const fact of facts) {
    for (const rawEntry of array(frozen?.entries)) {
      if (!isRecord(rawEntry)) continue
      if (slotKey(String(rawEntry.subjectRef), String(rawEntry.predicateKey), rawEntry.objectRef == null ? null : String(rawEntry.objectRef))
        !== slotKey(fact.subjectRef, fact.predicateKey, fact.objectRef ?? null)) continue
      if (rawEntry.authority === 'invariant' && rawEntry.canonicalValue !== fact.canonicalValue) {
        errors.push(`F1:${fact.factKey ?? fact.subjectRef}:conflicts-with=${String(rawEntry.factKey ?? 'world-fact')}`)
      }
    }
  }
  const canonPredicates = array(campaign.canonInvariantPredicates).filter(isRecord)
  for (const fact of facts) {
    for (const predicate of canonPredicates) {
      if (predicate.op !== 'world-fact') continue
      if (slotKey(String(predicate.subjectRef), String(predicate.predicateKey),
        predicate.objectRef == null ? null : String(predicate.objectRef))
        !== slotKey(fact.subjectRef, fact.predicateKey, fact.objectRef ?? null)) continue
      if (predicate.value !== undefined && predicate.value !== fact.canonicalValue) {
        errors.push(`F2:${fact.factKey ?? fact.subjectRef}:conflicts-with-canon`)
      }
    }
  }
  for (const [key, bucket] of bySlot) {
    for (const fact of bucket) {
      const conflicting = bucket.find(other =>
        other.factKey !== fact.factKey
        && other.canonicalValue !== fact.canonicalValue
        && other.supersedes !== fact.factKey
        && fact.supersedes !== other.factKey)
      if (conflicting) errors.push(`F3:${fact.factKey ?? key}:conflicts-with=${conflicting.factKey ?? key}`)
    }
  }
  const mutuallyExclusive = new Map<string, Set<string>>([
    ['open', new Set(['blocked'])],
    ['blocked', new Set(['open'])],
    ['allied-with', new Set(['hostile-to'])],
    ['hostile-to', new Set(['allied-with'])],
  ])
  for (const fact of facts) {
    if (fact.canonicalValue !== true) continue
    for (const other of facts) {
      if (other === fact || other.canonicalValue !== true) continue
      if (other.subjectRef === fact.subjectRef
        && (other.objectRef ?? null) === (fact.objectRef ?? null)
        && mutuallyExclusive.get(fact.predicateKey)?.has(other.predicateKey)) {
        errors.push(`F3:${fact.factKey ?? fact.subjectRef}:mutually-exclusive=${other.factKey ?? other.subjectRef}`)
      }
    }
  }
  return [...new Set(errors)].sort()
}

function gateG4(
  root: Record<string, unknown>,
  campaign: Record<string, unknown>,
): TtrpgOpenGateResultV1 {
  const facts = activeFactRows(root)
  const errors = factConsistencyEvidence(facts, campaign)
  const mode = facts.length > 500 ? 'incremental' : 'full'
  return gateResult(
    errors.length === 0,
    [`validation=${mode}`, `activeFacts=${facts.length}`, ...errors],
    null,
    '',
    null,
  )
}

function fillGateMetadata(
  result: TtrpgOpenGateResultV1,
  viewer: string | null,
  revision: string,
  basisHash: string | null,
): TtrpgOpenGateResultV1 {
  return {
    ...result,
    viewerKey: result.viewerKey ?? viewer,
    stageRevision: revision,
    evaluationBasisHash: basisHash,
    evidence: [...result.evidence],
  }
}

function notApplicableResult(
  status: 'closed' | 'paused',
  viewer: string | null,
  revision: string,
  basisHash: string | null,
): TtrpgOpenGateResultV1 {
  return gateResult(null, [`stage-${status}`, 'gate-evaluation-not-applicable'], viewer, revision, basisHash, 'not-applicable')
}

function normalizePreviousCount(
  root: Record<string, unknown>,
  key: TtrpgOpenGateKeyV1,
): number {
  const counts = isRecord(root.consecutiveFailures)
    ? root.consecutiveFailures
    : firstRecord(readRecord(root, 'openRun')?.consecutiveFailures)
  const value = counts[key]
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function stageRevisionChanged(
  root: Record<string, unknown>,
  previous: Partial<Record<TtrpgOpenGateKeyV1, TtrpgOpenGateResultV1>> | null,
  revision: string,
): boolean {
  const run = readRecord(root, 'openRun')
  const previousRevision = root.previousStageRevision ?? run?.previousStageRevision
  if (previousRevision !== undefined && String(previousRevision) !== revision) return true
  if (!previous) return false
  return Object.values(previous).some(result => result !== undefined && result.stageRevision !== revision)
}

export function evaluateTtrpgOpenRuntimeGatesV1(
  input: TtrpgOpenRuntimeGateInputV1 | unknown,
): TtrpgOpenRuntimeGateEvaluationV1 {
  const root = record(input, 'runtimeGates')
  const run = readRecord(root, 'openRun')
  const campaign = firstRecord(root.campaign, run?.campaign, root.content)
  const active = activeSituationRows(root)
  const templates = campaignTemplates(campaign)
  const actorKey = viewerActorKey(root)
  const currentViewerKey = viewerKey(root)
  const revision = stageRevision(root)
  const basisHash = evaluationBasisHash(root, campaign)
  const status = stageStatus(root)
  const context = predicateContext(root, campaign, active)
  const previous = isRecord(root.previousGateResults)
    ? root.previousGateResults as Partial<Record<TtrpgOpenGateKeyV1, TtrpgOpenGateResultV1>>
    : null

  const results = {} as Record<TtrpgOpenGateKeyV1, TtrpgOpenGateResultV1>
  if (status === 'closed' || status === 'paused') {
    for (const key of TTRPG_OPEN_GATE_KEYS) results[key] = notApplicableResult(status, currentViewerKey, revision, basisHash)
  } else {
    results['exit-exists'] = fillGateMetadata(gateG1(templates, active, actorKey, context), currentViewerKey, revision, basisHash)
    results['hypothesis-formable'] = fillGateMetadata(gateG2(templates, active, actorKey, context), currentViewerKey, revision, basisHash)
    results['telegraph-complete'] = fillGateMetadata(gateG3(root, campaign), currentViewerKey, revision, basisHash)
    results['facts-consistent'] = fillGateMetadata(gateG4(root, campaign), currentViewerKey, revision, basisHash)
  }

  const counts = {} as Record<TtrpgOpenGateKeyV1, number>
  const recovery = {} as Record<TtrpgOpenGateKeyV1, TtrpgOpenGateRecoveryV1>
  const requestAuthorReview: TtrpgOpenGateKeyV1[] = []
  const resetForNewStage = stageRevisionChanged(root, previous, revision)
  for (const key of TTRPG_OPEN_GATE_KEYS) {
    const result = results[key]
    if (result.applicability === 'not-applicable') {
      counts[key] = normalizePreviousCount(root, key)
      recovery[key] = 'none'
      continue
    }
    if (result.passed === true) {
      counts[key] = 0
      recovery[key] = 'none'
      continue
    }
    const next = resetForNewStage ? 1 : normalizePreviousCount(root, key) + 1
    counts[key] = next
    recovery[key] = next >= 3 ? 'request-author-review' : 'none'
    if (next >= 3) requestAuthorReview.push(key)
  }
  const allApplicablePassed = TTRPG_OPEN_GATE_KEYS.every(key =>
    results[key].applicability === 'not-applicable' || results[key].passed === true)
  const output = {
    results: clone(results),
    gates: clone(results),
    consecutiveFailures: counts,
    recovery,
    requestAuthorReview,
    allApplicablePassed,
    viewerKey: currentViewerKey,
    stageRevision: revision,
    evaluationBasisHash: basisHash,
  }
  return output
}

export function evaluateTtrpgOpenStageClosureV1(input: {
  stageClosurePolicy?: TtrpgOpenStageClosurePolicyV1
  policy?: TtrpgOpenStageClosurePolicyV1
  campaign?: Pick<TtrpgCampaignContentV2, 'stageClosurePolicy'>
  predicateContext?: TtrpgPredicateEvaluationContextV1
  worldTurn: number
} | unknown): TtrpgOpenStageClosureDecisionV1 {
  const root = record(input, 'stageClosure')
  const policy = root.stageClosurePolicy ?? root.policy ?? readRecord(root, 'campaign')?.stageClosurePolicy
  const parsed = closurePolicy(policy, 'stageClosurePolicy')
  const worldTurn = integer(root.worldTurn, 'worldTurn')
  if (worldTurn >= parsed.maximumWorldTurns) {
    return {
      eligible: true,
      reason: 'maximum-world-turns',
      triggerKey: null,
      summaryPrompt: null,
      maximumReached: true,
      evidence: [`worldTurn=${worldTurn}`, `maximumWorldTurns=${parsed.maximumWorldTurns}`],
    }
  }
  const rawContext = root.predicateContext as TtrpgPredicateEvaluationContextV1 | undefined
  const context = rawContext
    ? { ...rawContext, worldTurn } as TtrpgPredicateEvaluationContextV1
    : undefined
  const errors: string[] = []
  for (const trigger of parsed.triggers) {
    if (!context) {
      errors.push(`${trigger.triggerKey}:predicateContext缺失`)
      continue
    }
    const result = predicateValue(trigger.predicate, context)
    if (result.error) {
      errors.push(`${trigger.triggerKey}:${result.error}`)
      continue
    }
    if (result.value) {
      return {
        eligible: true,
        reason: 'trigger',
        triggerKey: trigger.triggerKey,
        summaryPrompt: trigger.summaryPrompt,
        maximumReached: false,
        evidence: [`trigger=${trigger.triggerKey}`, `worldTurn=${worldTurn}`],
      }
    }
  }
  return {
    eligible: false,
    reason: 'not-eligible',
    triggerKey: null,
    summaryPrompt: null,
    maximumReached: false,
    evidence: [`worldTurn=${worldTurn}`, `maximumWorldTurns=${parsed.maximumWorldTurns}`, ...errors],
  }
}
