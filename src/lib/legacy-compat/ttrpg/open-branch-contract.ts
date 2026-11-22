/** Portable, frozen ancestor evidence. It is an audit snapshot, never a second live gameplay owner. */
import type { ProductRuntimeEvent } from '../../types/index';
import { PRODUCT_RUNTIME_EVENT_TYPES } from '../../types/index';
import { parseTtrpgOpenAuthorizationV1, type TtrpgOpenAuthorizationV1 } from './open-authorization';
import { parseTtrpgOpenRunStateV1, type TtrpgOpenRunStateV1 } from './open-runtime-contract';
import { parseTtrpgOpenOperationV1, type TtrpgOpenOperationV1 } from './open-operation';
import { parseTtrpgOpenSourceRefV1, type TtrpgOpenSourceRefV1 } from './open-coordination';
import { hashProductProductionValueV2 } from '../product-production/hash';
import { sha256Text } from '../../ai/chapter-memory/text-normalization';
import * as p from './open-contract-parse'
export { ttrpgOpenAncestorSourceAllowedV1 } from './open-coordination'

export interface TtrpgOpenAncestorEvidenceV1 {
  sessionKey: string
  throughSequence: number
  stateHash: string
  runtimeSourceHash: string
  randomSource: { seed: string; seedCommitment: string }
  events: Array<{ sourceRef: TtrpgOpenSourceRefV1; type: ProductRuntimeEvent['type']; payloadHash: string; portablePayloadHash?: string }>
  snapshot: { authorization: TtrpgOpenAuthorizationV1 | null; openRun: TtrpgOpenRunStateV1 | null }
  evidenceHash: string
}
export interface TtrpgOpenBranchRecoveryTaskV1 {
  taskKey: string
  ancestorSessionKey: string
  operation: TtrpgOpenOperationV1
  remainingStepKeys: string[]
  inheritedRef: TtrpgOpenSourceRefV1 | null
  childOperationKey: string | null
  status: 'awaiting-authorization' | 'ready' | 'executing' | 'completed' | 'withdrawn'
}
export interface TtrpgOpenBranchLineageV1 {
  schema: 'storyforge.ttrpg-open-branch-lineage'
  version: 1
  parentSessionKey: string
  ancestors: TtrpgOpenAncestorEvidenceV1[]
  recoveryTasks: TtrpgOpenBranchRecoveryTaskV1[]
}
function fail(message: string): never { return p.fail(`branch lineage: ${message}`) }
function parseAncestor(value: unknown): TtrpgOpenAncestorEvidenceV1 {
  const a = p.record(value, ['sessionKey', 'throughSequence', 'stateHash', 'runtimeSourceHash', 'randomSource', 'events', 'snapshot', 'evidenceHash'], 'ancestor')
  const sessionKey = p.key(a.sessionKey, 'ancestor session')
  const throughSequence = p.integer(a.throughSequence, 'ancestor cutpoint', 0, Number.MAX_SAFE_INTEGER)
  const random = p.record(a.randomSource, ['seed', 'seedCommitment'], 'ancestor random source')
  const snapshot = p.record(a.snapshot, ['authorization', 'openRun'], 'ancestor snapshot')
  const events = p.list(a.events, 'ancestor events', value => {
    const row = p.record(value, ['sourceRef', 'type', 'payloadHash', ...(Object.prototype.hasOwnProperty.call(value, 'portablePayloadHash') ? ['portablePayloadHash'] : [])], 'ancestor event')
    const type = p.oneOf(row.type, PRODUCT_RUNTIME_EVENT_TYPES, 'ancestor event type')
    return { sourceRef: parseTtrpgOpenSourceRefV1(row.sourceRef), type, payloadHash: p.hash(row.payloadHash, 'ancestor payload hash'),
      ...(Object.prototype.hasOwnProperty.call(row, 'portablePayloadHash') ? { portablePayloadHash: p.hash(row.portablePayloadHash, 'ancestor portable payload hash') } : {}) }
  }, 100_000)
  if (events.length !== throughSequence || events.some((event, index) => event.sourceRef.sessionKey !== sessionKey
    || event.sourceRef.sequence !== index + 1)) fail('祖先事件必须是切点内的连续真实序列')
  const authorization = snapshot.authorization === null ? null : parseTtrpgOpenAuthorizationV1(snapshot.authorization)
  const openRun = snapshot.openRun === null ? null : parseTtrpgOpenRunStateV1(snapshot.openRun, sessionKey)
  if ((authorization !== null && (authorization.sourceRef.sessionKey !== sessionKey || authorization.revision > throughSequence))
    || (authorization !== null && events[authorization.revision - 1]?.type !== 'ttrpg.session-zero.completed')
    || (openRun !== null && authorization === null && (openRun.coordination.activeEpochKey !== null
      || openRun.coordination.calls.length || openRun.operations.length))) fail('祖先授权/运行不属于冻结切点')
  return { sessionKey, throughSequence, stateHash: p.hash(a.stateHash, 'ancestor state hash'),
    runtimeSourceHash: p.hash(a.runtimeSourceHash, 'ancestor source hash'),
    randomSource: { seed: p.text(random.seed, 'ancestor game seed', 1000), seedCommitment: p.hash(random.seedCommitment, 'ancestor seed commitment') },
    events, snapshot: { authorization, openRun }, evidenceHash: p.hash(a.evidenceHash, 'ancestor evidence hash') }
}
export function parseTtrpgOpenBranchLineageV1(value: unknown, childSessionKey: string): TtrpgOpenBranchLineageV1 {
  const r = p.record(value, ['schema', 'version', 'parentSessionKey', 'ancestors', 'recoveryTasks'], 'branch lineage')
  p.literal(r.schema, 'storyforge.ttrpg-open-branch-lineage', 'lineage schema'); p.literal(r.version, 1, 'lineage version')
  const parentSessionKey = p.key(r.parentSessionKey, 'parent session')
  const ancestors = p.list(r.ancestors, 'ancestors', parseAncestor, 1000, 1)
  if (new Set(ancestors.map(a => a.sessionKey)).size !== ancestors.length || ancestors.some(a => a.sessionKey === childSessionKey)
    || ancestors[ancestors.length - 1]?.sessionKey !== parentSessionKey) fail('祖先链必须唯一、无自环且以直接父分支结束')
  const ancestorMap = new Map(ancestors.map(a => [a.sessionKey, a]))
  const recoveryTasks = p.list(r.recoveryTasks, 'recovery tasks', value => {
    const t = p.record(value, ['taskKey', 'ancestorSessionKey', 'operation', 'remainingStepKeys', 'inheritedRef', 'childOperationKey', 'status'], 'branch recovery')
    const ancestorSessionKey = p.key(t.ancestorSessionKey, 'recovery ancestor')
    const ancestor = ancestorMap.get(ancestorSessionKey) ?? fail('恢复任务缺少祖先证据')
    const operation = parseTtrpgOpenOperationV1(t.operation, ancestorSessionKey)
    const original = ancestor.snapshot.openRun?.operations.find(o => o.operationKey === operation.operationKey)
    if (!original || JSON.stringify(original) !== JSON.stringify(operation)) fail('恢复任务不能改写父冻结 operation')
    const remainingStepKeys = p.keys(t.remainingStepKeys, 'remaining steps', 100, 0)
    if (remainingStepKeys.join(',') !== operation.plannedSteps.slice(operation.businessRefs.length).map(step => step.stepKey).join(',')) fail('恢复只能从父已提交业务之后继续')
    const inheritedRef = t.inheritedRef === null ? null : parseTtrpgOpenSourceRefV1(t.inheritedRef)
    const childOperationKey = p.nullable(t.childOperationKey, p.key, 'child operation')
    const status = p.oneOf(t.status, ['awaiting-authorization', 'ready', 'executing', 'completed', 'withdrawn'], 'recovery status')
    if ((inheritedRef !== null && inheritedRef.sessionKey !== childSessionKey)
      || (status === 'awaiting-authorization' && (inheritedRef !== null || childOperationKey !== null))
      || (status === 'ready' && (inheritedRef === null || childOperationKey !== null))
      || (['executing', 'completed'].includes(status) && (inheritedRef === null || childOperationKey === null))) fail('恢复任务必须先有本地因果与真人新授权')
    return { taskKey: p.key(t.taskKey, 'recovery task'), ancestorSessionKey, operation, remainingStepKeys, inheritedRef, childOperationKey, status }
  }, 1000)
  if (new Set(recoveryTasks.map(t => t.taskKey)).size !== recoveryTasks.length) fail('恢复任务重复')
  return { schema: 'storyforge.ttrpg-open-branch-lineage', version: 1, parentSessionKey, ancestors, recoveryTasks }
}
export async function verifyTtrpgOpenBranchLineageV1(lineage: TtrpgOpenBranchLineageV1, childSessionKey: string): Promise<void> {
  const parsed = parseTtrpgOpenBranchLineageV1(lineage, childSessionKey)
  for (const ancestor of parsed.ancestors) {
    const { evidenceHash, ...body } = ancestor
    if (await hashProductProductionValueV2(body) !== evidenceHash
      || await sha256Text(ancestor.randomSource.seed) !== ancestor.randomSource.seedCommitment) fail('祖先证据或随机种子封存 hash 不一致')
  }
}
