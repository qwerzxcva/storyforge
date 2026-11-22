
import { hashProductProductionValueV2, isSha256Hash } from '../product-production/hash';
import { validateTextOpenWorldResponsibilitySnapshotV1 } from './responsibility-assembly';
import type { ProductRuntimePackageV1, TextOpenWorldIntegrationReportV1 } from '../../types/index';
import { TEXT_OPEN_WORLD_RUNTIME_MODULE_KEYS_V1 } from '../../types/index';
import { parseTextOpenWorldModulesV1 } from './modules';

function fail(message: string): never {
  throw new Error(`[text-open-world-v3] ${message}`)
}

export async function validateTextOpenWorldIntegrationReportV1(input: {
  runtimePackage: ProductRuntimePackageV1
  report: TextOpenWorldIntegrationReportV1
  expectedPlanHash?: string
}): Promise<TextOpenWorldIntegrationReportV1> {
  const { runtimePackage, report } = input
  if (report.schema !== 'storyforge.text-open-world-integration-report' || ![1, 2].includes(report.version)
    || report.productType !== 'text-open-world' || !runtimePackage.textOpenWorldVNext
    || report.productInstanceKey !== runtimePackage.definition.productKey) fail('IntegrationReport身份无效')
  const reportBody = { ...report }
  delete (reportBody as Partial<TextOpenWorldIntegrationReportV1>).integrationReportHash
  if (!isSha256Hash(report.integrationReportHash)
    || await hashProductProductionValueV2(reportBody) !== report.integrationReportHash) {
    fail('IntegrationReport自身Hash不匹配')
  }
  const packageHash = await hashProductProductionValueV2(runtimePackage)
  if (packageHash !== report.runtimePackageHash) fail('IntegrationReport与RuntimePackage Hash不一致')
  if (report.version === 2) {
    if (input.expectedPlanHash && report.responsibilitySnapshot?.planHash !== input.expectedPlanHash) fail('三线快照不属于当前冻结计划')
    await validateTextOpenWorldResponsibilitySnapshotV1(report.responsibilitySnapshot, {
      sourcePinHash: report.sourcePinHash,
      generatedMediaArtifactKeys: report.generatedBindings.generatedMediaArtifactKeys,
    })
  } else if (report.responsibilitySnapshot !== undefined) fail('旧版 IntegrationReport 不得冒充三线快照')
  const parsedModules = parseTextOpenWorldModulesV1(runtimePackage.textOpenWorldVNext)
  const corrections = report.generatedBindings.sceneRegionCorrections
  if (corrections !== undefined) {
    if (!Array.isArray(corrections) || new Set(corrections.map(item => item.sceneKey)).size !== corrections.length) {
      fail('IntegrationReport场景地区校正证据重复或无效')
    }
    for (const correction of corrections) {
      if (parsedModules.narrative.version !== 2) fail('旧版Narrative没有可校正的场景地区')
      const scene = parsedModules.narrative.scenes.find(item => item.key === correction.sceneKey)
      if (!scene || scene.sourceKind !== 'quest-objective'
        || scene.locationKey !== correction.locationKey || scene.regionKey !== correction.runtimeRegionKey
        || correction.sourceRegionKey === correction.runtimeRegionKey
        || !parsedModules.world.regions.some(region => region.key === correction.sourceRegionKey)) {
        fail('IntegrationReport场景地区校正与RuntimePackage不一致')
      }
    }
  }
  const moduleKeys = new Set(report.modules.map(item => item.moduleKey))
  if (report.modules.length !== TEXT_OPEN_WORLD_RUNTIME_MODULE_KEYS_V1.length
    || moduleKeys.size !== report.modules.length
    || TEXT_OPEN_WORLD_RUNTIME_MODULE_KEYS_V1.some(key => !moduleKeys.has(key))) {
    fail('IntegrationReport模块集合不完整')
  }
  for (const module of report.modules) {
    const envelope = runtimePackage.textOpenWorldVNext.modules[module.moduleKey]
    if (!module.parsed || module.schemaVersion !== envelope.schemaVersion
      || module.contentHash !== envelope.contentHash || !module.sourceArtifactKeys.length) {
      fail(`IntegrationReport模块证据不一致:${module.moduleKey}`)
    }
  }
  const mediaBody = { ...report.media }
  delete (mediaBody as Partial<TextOpenWorldIntegrationReportV1['media']>).coverageEvidenceHash
  if (!isSha256Hash(report.media.coverageEvidenceHash)
    || await hashProductProductionValueV2(mediaBody) !== report.media.coverageEvidenceHash) {
    fail('IntegrationReport媒资覆盖证据Hash不匹配')
  }
  const coverageNumbers = [
    report.media.playableCoverage, report.media.generatedRequiredCoverage,
    report.media.evaluatedCoverage, report.media.minimumCoverage,
  ]
  const coverageCounts = [
    report.media.slotCount, report.media.requiredSlotCount,
    report.media.requiredGeneratedSlotCount, report.media.generatedBindingCount,
    report.media.generatedRequiredBindingCount, report.media.fallbackReadyCount,
  ]
  if (coverageNumbers.some(value => !Number.isFinite(value) || value < 0 || value > 1)
    || coverageCounts.some(value => !Number.isSafeInteger(value) || value < 0)
    || report.media.evaluatedCoverage !== (report.media.qualityProfile === 'commercial-candidate'
      ? report.media.generatedRequiredCoverage : report.media.playableCoverage)
    || report.media.releaseReady !== (report.media.evaluatedCoverage >= report.media.minimumCoverage)) {
    fail('IntegrationReport媒资覆盖结论无效')
  }
  const rightsBody = { ...report.rights }
  delete (rightsBody as Partial<TextOpenWorldIntegrationReportV1['rights']>).rightsEvidenceHash
  if (!isSha256Hash(report.rights.rightsEvidenceHash)
    || await hashProductProductionValueV2(rightsBody) !== report.rights.rightsEvidenceHash
    || !report.rights.complete || !report.rights.commercialPolicyPassed
    || report.rights.evaluatedArtifactCount !== report.rights.evidence.length) {
    fail('IntegrationReport媒资权利总证据无效')
  }
  for (const evidence of report.rights.evidence) {
    const evidenceBody = { ...evidence }
    delete (evidenceBody as Partial<typeof evidence>).evidenceHash
    if (!isSha256Hash(evidence.evidenceHash)
      || await hashProductProductionValueV2(evidenceBody) !== evidence.evidenceHash
      || !isSha256Hash(evidence.producerReceiptHash)
      || (evidence.providerReceiptHash != null && !isSha256Hash(evidence.providerReceiptHash))) {
      fail(`IntegrationReport媒资权利明细无效:${evidence.artifactKey}`)
    }
  }
  const generatedArtifactKeys = [...report.generatedBindings.generatedMediaArtifactKeys].sort()
  const evidenceArtifactKeys = report.rights.evidence.map(item => item.artifactKey).sort()
  const runtimeAssets = runtimePackage.presentation?.assets ?? []
  const runtimeAssetKeys = runtimeAssets.map(item => item.assetKey).sort()
  const boundSlotAssetKeys = parsedModules.presentation.mediaSlots
    .flatMap(slot => slot.assetKey == null ? [] : [slot.assetKey]).sort()
  const evidenceAssetKeys = report.rights.evidence.map(item => item.assetKey).sort()
  if (generatedArtifactKeys.join('|') !== evidenceArtifactKeys.join('|')
    || runtimeAssetKeys.join('|') !== evidenceAssetKeys.join('|')
    || runtimeAssetKeys.join('|') !== boundSlotAssetKeys.join('|')
    || runtimeAssets.length !== report.media.generatedBindingCount
    || report.media.slotCount !== parsedModules.presentation.mediaSlots.length
    || report.media.requiredSlotCount !== runtimePackage.textOpenWorldVNext.mediaManifest.requiredSlotKeys.length) {
    fail('IntegrationReport媒资绑定、权利或槽位集合不闭合')
  }
  for (const asset of runtimeAssets) {
    const evidence = report.rights.evidence.find(item => item.assetKey === asset.assetKey)
      ?? fail(`IntegrationReport缺少媒资权利:${asset.assetKey}`)
    if (asset.source !== evidence.source || asset.license !== evidence.license) {
      fail(`IntegrationReport媒资权利与运行包不一致:${asset.assetKey}`)
    }
  }
  const expectedBasisHash = await hashProductProductionValueV2({
    runtimePackageHash: report.runtimePackageHash, sourcePinHash: report.sourcePinHash,
    systemConfigsHash: report.systemConfigsHash,
    deterministicPreflightHash: report.deterministicPreflightHash,
    balanceReviewHash: report.balanceReviewHash, semanticReviewHash: report.semanticReviewHash,
    coverageEvidenceHash: report.media.coverageEvidenceHash,
    rightsEvidenceHash: report.rights.rightsEvidenceHash,
  })
  if (report.basisHash !== expectedBasisHash
    || !Object.values(report.verification).every(value => value === true)) {
    fail('IntegrationReport基础证据或验证结论无效')
  }
  return report
}
