import { canonicalStringify, hashCanonicalValue } from '../agent/run/hash';
import type { ProductSourceManifestV2, ProductSourcePlanV2 } from '../types';
import { hashProductProductionValueV2 } from '../legacy-compat/product-production/hash';

const unique = (values: readonly string[]) => [...new Set(values)].sort()
const same = (left: unknown, right: unknown) => canonicalStringify(left) === canonicalStringify(right)
function fail(detail: string): never { throw new Error(`[product-source-exact] ${detail}`) }
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

async function exactSourcePolicyIdV2(plan: Omit<ProductSourcePlanV2, 'planHash'>): Promise<string> {
  const { gatewayPolicyHash: _derived, gatewayPolicy, ...body } = plan
  const { localReleaseRecordId: _local, ...worldReference } = body.worldReference
  const { policyId: _derivedId, ...policy } = gatewayPolicy
  return `world-source-plan-exact-v2:${await hashCanonicalValue({ ...body, worldReference, gatewayPolicy: policy })}`
}

export function exactProductCompilerIdV2(productType: string): string {
  if (productType === 'character-interaction') return 'storyforge.character-interaction.world-compiler'
  if (productType === 'avg') return 'storyforge.avg.world-compiler'
  return fail('产品尚未登记精确来源编译器')
}

/** Portable structural verification in addition to the shared plan hash,
 * permission and reference checks. Physical catalog verification is separate. */
export async function validateExactSourcePlanFieldsV2(plan: ProductSourcePlanV2): Promise<void> {
  const { planHash: _planHash, ...body } = plan
  if (plan.gatewayPolicy.policyId !== await exactSourcePolicyIdV2(body)) fail('读取策略未绑定精确计划输入')
  const exact = plan.exact
  if (plan.compiler.compilerId !== exactProductCompilerIdV2(plan.productType) || plan.compiler.compilerVersion !== 1
    || plan.compiler.resolverVersion !== (plan.worldReference.version === 2 ? 'narrative-neutral-closure-v1' : 'world-neutral-closure-v2') || !hash(plan.compiler.briefHash)
    || plan.compiler.configurationHash !== await hashCanonicalValue(plan.configuration)) fail('编译器/配置合同不一致')
  for (const values of [exact.authorResourceKeys, exact.dependencyResourceKeys, exact.requiredResourceKeys, exact.permittedResourceKeys]) {
    if (!same(values, unique(values))) fail('精确资源集合不是 canonical keys')
  }
  if (!exact.authorResourceKeys.length || exact.dependencyResourceKeys.some(key => exact.authorResourceKeys.includes(key))
    || !same(unique([...exact.authorResourceKeys, ...exact.dependencyResourceKeys]), exact.requiredResourceKeys)
    || !same(exact.requiredResourceKeys, exact.permittedResourceKeys)
    || !same(exact.resources.map(item => item.resourceKey), exact.requiredResourceKeys)) fail('A∪D 与精确 required/permission 不一致')
  if (exact.resources.some(item => item.minimumDepth !== 'original' || !hash(item.contentHash) || !hash(item.sourceRefsHash)
    || !plan.permission.allowedAreas.includes(item.area) || !plan.permission.allowedContextKinds.includes(item.contextKind)
    || typeof item.resourceKind !== 'string' || !item.resourceKind)) fail('必读能力、深度或证据 hash 非法')
  const closureHash = await hashCanonicalValue({ resolverVersion: plan.compiler.resolverVersion,
    authorResourceKeys: exact.authorResourceKeys, dependencyResourceKeys: exact.dependencyResourceKeys, resources: exact.resources })
  if (closureHash !== exact.closureHash || !same(exact.views, ['canon']) || !same(exact.audiences, ['product-author'])
    || !same(exact.branches, ['canon']) || exact.timeBound !== null) fail('闭包或读取视角合同不一致')
  if (Object.values(plan.configuration.roleBindings).flat().some(key => !exact.authorResourceKeys.includes(key))) fail('角色绑定超出选择')
  if (exact.requirements.length !== plan.requirements.length) fail('精确规则缺失')
  for (const [index, rule] of plan.requirements.entries()) {
    const frozen = exact.requirements[index]!
    if (frozen.requirementKey !== rule.key || !same(frozen.requiredResourceKeys, unique(frozen.requiredResourceKeys))
      || frozen.requiredResourceKeys.some(key => !exact.requiredResourceKeys.includes(key))) fail('精确规则资源不一致')
    if (rule.condition) {
      const condition = frozen.condition
      if (!condition || condition.expressionVersion !== 'brief-derived-boolean-v1'
        || !['inheritStoryContinuity', 'allowCrossWorld'].includes(condition.field)
        || condition.field !== rule.condition.key || condition.briefHash !== plan.compiler.briefHash
        || typeof condition.value !== 'boolean' || condition.value !== plan.configuration[condition.field]
        || condition.result !== condition.value || condition.result !== rule.condition.active) fail('条件与冻结 Brief 配置不一致')
    } else if (frozen.condition) fail('无条件规则包含可切换条件')
    const active = rule.level === 'stable-required' || (rule.level === 'conditional' && rule.condition?.active)
    if (active ? frozen.requiredResourceKeys.length < rule.minimumResources : frozen.requiredResourceKeys.length !== 0) fail('精确规则必读集合不完整')
  }
  if (!same(exact.slices.map(slice => slice.key), ['adaptation', 'content', 'integration'])
    || !same(exact.slices[2]!.resourceKeys, exact.requiredResourceKeys)
    || (plan.worldReference.version === 1 && (!same(exact.slices[1]!.resourceKeys, exact.authorResourceKeys)
      || !same(exact.slices[0]!.resourceKeys, unique(plan.initialResourceKeys))))
    || exact.authorResourceKeys.some(key => !exact.slices[1]!.resourceKeys.includes(key))
    || plan.initialResourceKeys.some(key => !exact.slices[0]!.resourceKeys.includes(key))
    || exact.slices.some(slice => !slice.purpose.trim() || !same(slice.resourceKeys, unique(slice.resourceKeys))
      || slice.resourceKeys.some(key => !exact.requiredResourceKeys.includes(key)))) fail('任务切片未闭合')
}

export async function exactManifestEvidenceV2(plan: ProductSourcePlanV2): Promise<ProductSourceManifestV2['exactEvidence']> {
  return { compilerHash: await hashCanonicalValue(plan.compiler), closureHash: plan.exact.closureHash,
    requiredResourceKeys: [...plan.exact.requiredResourceKeys], resourceRequirementsHash: await hashCanonicalValue(plan.exact.resources) }
}

export async function assertExactSourceManifestV2(plan: ProductSourcePlanV2, manifest: ProductSourceManifestV2): Promise<void> {
  if (!same(await exactManifestEvidenceV2(plan), manifest.exactEvidence)) fail('实际来源清单未绑定精确计划')
  const byKey = new Map(manifest.resources.map(item => [item.resourceKey, item]))
  if (byKey.size !== manifest.resources.length || manifest.resources.some(item => !plan.exact.permittedResourceKeys.includes(item.resourceKey))) fail('实际读取越过精确权限或存在重复')
  const pointerHashes = new Set(manifest.runContextManifests.map(item => item.manifestHash))
  for (const required of plan.exact.resources) {
    const read = byKey.get(required.resourceKey)
    if (!read || read.status !== 'matched' || !read.depths.includes(required.minimumDepth)
      || read.area !== required.area || read.resourceKind !== required.resourceKind
      || !same(read.contentHashes, [required.contentHash]) || read.sourceRefsHash !== required.sourceRefsHash
      || !read.contextManifestHashes.length || read.contextManifestHashes.some(value => !pointerHashes.has(value))) {
      fail(`缺少精确必读原文/深度/hash/真实 manifest 证据:${required.resourceKey}`)
    }
  }
  if (manifest.requirementOutcomes.length !== plan.requirements.length) fail('需求读取结果缺失')
  for (const [index, rule] of plan.requirements.entries()) {
    const outcome = manifest.requirementOutcomes[index]!
    if (outcome.requirementKey !== rule.key) fail('需求读取结果身份不一致')
    const active = rule.level === 'stable-required' || (rule.level === 'conditional' && rule.condition?.active)
    if (active && (outcome.status !== 'matched'
      || !same(outcome.evidenceResourceKeys, plan.exact.requirements[index]!.requiredResourceKeys))) fail('必读需求未按精确集合核验')
    if ((rule.level === 'prohibited' || (rule.level === 'conditional' && !rule.condition?.active))
      && (outcome.status !== 'omitted' || outcome.evidenceResourceKeys.length)) fail('禁止/未激活需求不能伪造读取结果')
  }
  for (const status of ['matched', 'missing', 'conflict', 'omitted', 'insufficient'] as const) {
    if (manifest.summary[status] !== manifest.requirementOutcomes.filter(item => item.status === status).length) fail('需求结果统计不一致')
  }
}

/** Shared by backup export/import before mutation. Existing V1/creator rows
 * retain their compatibility policy; enhanced/unknown world-plan versions
 * cannot enter storage with an unchecked embedded contract. */
export async function validateEnhancedProductSourcePlanRecordV2(row: {
  sourcePlanJson: string; sourcePlanHash: string; briefJson: string; briefHash: string;
  sourceWorldReleaseId: number; sourceWorldContentHash: string;
}): Promise<ProductSourcePlanV2 | null> {
  const value = JSON.parse(row.sourcePlanJson)
  if (value?.schema !== 'storyforge.product-source-plan' || value.version === 1) return null
  const contracts = await import('./source-contracts')
  const plan = await contracts.validateProductSourcePlan(value)
  if (plan.version !== 2 || plan.planHash !== row.sourcePlanHash || plan.compiler.briefHash !== row.briefHash
    || await hashProductProductionValueV2(JSON.parse(row.briefJson)) !== row.briefHash
    || plan.worldReference.localReleaseRecordId !== row.sourceWorldReleaseId
    || plan.worldReference.releaseHash !== row.sourceWorldContentHash) fail('Brief/精确 SourcePlan/世界 locator 或 hash 不一致')
  return plan
}
