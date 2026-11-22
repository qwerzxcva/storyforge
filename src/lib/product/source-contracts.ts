
import { validateWorldSourcePurposeProofV1 } from '../world-engine/source-purpose-contract';
import { hashCanonicalValue } from '../agent/run/hash';
import type { ConfirmedProductBriefV1, ProductReleaseLineageV1, ProductSourceMissingStrategyV1, ProductSourcePlanV1, ProductSourcePlan, ProductSourceManifest, WorldRequirementResolutionV1 } from '../types';
import type { ContextResourceDepthV1 } from '../registry/types';
import { validatePortableWorldReferenceV1 } from '../world-engine/world-reference';

import { assertExactSourceManifestV2, validateExactSourcePlanFieldsV2 } from './exact-source-contracts';
import { validatePortableWorldReference } from '../world-engine/world-reference-v2';

const HASH = /^[a-f0-9]{64}$/

export class ProductSourceContractErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(`[product-source-contract:${code}] ${message}`)
    this.name = 'ProductSourceContractErrorV1'
  }
}

function fail(code: string, message: string): never {
  throw new ProductSourceContractErrorV1(code, message)
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[]
}

function assertHash(value: string, label: string): void {
  if (!HASH.test(value)) fail('hash', `${label} 必须是 SHA-256`)
}

function permissionFromRequirements(
  requirements: readonly WorldRequirementResolutionV1[],
  allowedDepths: ContextResourceDepthV1[],
): ProductSourcePlanV1['permission'] {
  const active = requirements.filter(item => item.level !== 'prohibited'
    && !(item.level === 'conditional' && !item.condition?.active))
  const prohibited = requirements.filter(item => item.level === 'prohibited')
  return {
    allowedSelectors: active.map(item => structuredClone(item.selector)),
    prohibitedSelectors: prohibited.map(item => structuredClone(item.selector)),
    allowedAreas: uniqueSorted(active.flatMap(item => item.selector.areas)),
    allowedResourceKinds: uniqueSorted(active.flatMap(item => item.selector.resourceKinds)),
    allowedContextKinds: uniqueSorted(active.flatMap(item => item.selector.contextKinds)),
    allowedDepths,
    prohibitedAreas: uniqueSorted(prohibited.flatMap(item => item.selector.areas)),
    prohibitedResourceKinds: uniqueSorted(prohibited.flatMap(item => item.selector.resourceKinds)),
  }
}

function portableSourcePlanBodyV1(
  body: Omit<ProductSourcePlan, 'planHash'>,
): unknown {
  const { localReleaseRecordId: _localLocator, ...portableWorldReference } = body.worldReference
  return { ...body, worldReference: portableWorldReference }
}

function readiness(input: {
  requirements: readonly WorldRequirementResolutionV1[]
  missingStrategy: ProductSourceMissingStrategyV1
}): ProductSourcePlanV1['readiness'] {
  const hardGaps = input.requirements.filter(item => item.level === 'stable-required'
    && (item.status === 'missing' || item.status === 'insufficient' || item.status === 'conflict'))
  if (!hardGaps.length) return 'ready'
  return input.missingStrategy === 'block' || input.missingStrategy === 'ask-author'
    ? 'blocked'
    : 'ready-with-gaps'
}

/** Explicit dispatch; never coerces a frozen V1 plan into enhanced authority. */
export async function validateProductSourcePlan(plan: ProductSourcePlan): Promise<ProductSourcePlan> {
  if (plan.schema !== 'storyforge.product-source-plan' || ![1, 2].includes(plan.version)) fail('plan-contract', 'SourcePlan 合同身份无效')
  assertHash(plan.planHash, 'planHash')
  assertHash(plan.gatewayPolicyHash, 'gatewayPolicyHash')
  if (plan.version === 1) await validatePortableWorldReferenceV1(plan.worldReference)
  else await validatePortableWorldReference(plan.worldReference)
  const { planHash, ...body } = plan
  if (await hashCanonicalValue(portableSourcePlanBodyV1(body)) !== planHash
    || await hashCanonicalValue(plan.gatewayPolicy) !== plan.gatewayPolicyHash) {
    fail('plan-hash', 'SourcePlan 或 Gateway policy hash 不匹配')
  }
  if (plan.sourcePurpose !== undefined) validateWorldSourcePurposeProofV1(plan.sourcePurpose, plan.worldReference, plan.productType)
  const expectedPermission = permissionFromRequirements(plan.requirements, plan.permission.allowedDepths)
  if (await hashCanonicalValue(expectedPermission) !== await hashCanonicalValue(plan.permission)) {
    fail('plan-permission', 'SourcePlan permission 不是由冻结需求规则推导所得')
  }
  const normalizedReadiness = readiness({ requirements: plan.requirements, missingStrategy: plan.missingStrategy })
  if (normalizedReadiness !== plan.readiness) fail('plan-readiness', 'SourcePlan readiness 与必读缺口不一致')
  if (plan.version === 2) await validateExactSourcePlanFieldsV2(plan)
  return structuredClone(plan)
}

export async function validateConfirmedProductBriefV1(input: {
  brief: ConfirmedProductBriefV1
  sourcePlan: ProductSourcePlan
}): Promise<ConfirmedProductBriefV1> {
  const plan = await validateProductSourcePlan(input.sourcePlan)
  const brief = input.brief
  if (plan.version === 2 && brief.briefContentHash !== plan.compiler.briefHash) fail('brief-stale', '确认 Brief 不匹配精确来源计划')
  if (brief.schema !== 'storyforge.confirmed-product-brief' || brief.version !== 1
    || brief.sourcePlanHash !== plan.planHash || brief.productType !== plan.productType
    || brief.productInstanceKey !== plan.productInstanceKey) fail('brief-contract', '确认 Brief 与 SourcePlan 不一致')
  const { confirmationHash, ...body } = brief
  assertHash(confirmationHash, 'confirmationHash')
  if (await hashCanonicalValue(body) !== confirmationHash) fail('brief-hash', '确认 Brief hash 不匹配')
  return structuredClone(brief)
}

export async function validateProductSourceManifest(input: {
  sourceManifest: ProductSourceManifest
  sourcePlan: ProductSourcePlan
}): Promise<ProductSourceManifest> {
  const plan = await validateProductSourcePlan(input.sourcePlan)
  const manifest = input.sourceManifest
  if (manifest.schema !== 'storyforge.product-source-manifest' || manifest.version !== plan.version
    || manifest.productType !== plan.productType || manifest.productInstanceKey !== plan.productInstanceKey
    || manifest.worldReferenceHash !== plan.worldReference.referenceHash
    || manifest.sourcePlanHash !== plan.planHash) {
    fail('source-manifest-contract', 'ProductSourceManifest 与 SourcePlan owner/hash 链不一致')
  }
  assertHash(manifest.manifestHash, 'sourceManifest.manifestHash')
  const { manifestHash, ...body } = manifest
  if (await hashCanonicalValue(body) !== manifestHash) fail('source-manifest-hash', 'ProductSourceManifest hash 不匹配')
  const pointerKeys = new Set<string>()
  for (const pointer of manifest.runContextManifests) {
    const key = `${pointer.manifestHash}:${pointer.stepId}:${pointer.attempt}`
    if (!pointer.stepId.trim() || !Number.isSafeInteger(pointer.attempt) || pointer.attempt < 1
      || pointerKeys.has(key)) fail('source-manifest-pointer', 'ProductSourceManifest evidence pointer 非法或重复')
    pointerKeys.add(key)
    assertHash(pointer.manifestHash, 'sourceManifest.pointer.manifestHash')
  }
  if (plan.version === 2 && manifest.version === 2) await assertExactSourceManifestV2(plan, manifest)
  return structuredClone(manifest)
}

/** Runtime stage gate: only an immutable ProductRelease lineage can start. */
export async function validateProductReleaseLineageV1(value: ProductReleaseLineageV1): Promise<ProductReleaseLineageV1> {
  if (value.schema !== 'storyforge.product-release-lineage' || value.version !== 1) fail('lineage-contract', 'ProductReleaseLineage 合同无效')
  const { lineageHash, ...body } = value
  assertHash(lineageHash, 'lineageHash')
  if (await hashCanonicalValue(body) !== lineageHash || !value.quality.passed) fail('lineage-hash', 'ProductReleaseLineage hash/质量门无效')
  return structuredClone(value)
}
