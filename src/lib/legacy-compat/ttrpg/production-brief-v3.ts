import { parseTtrpgCompatibleOpeningRevision, type TtrpgCompatibleOpeningRevision } from './open-compatible-opening-contract';
import type { ProductSourcePlanV1, WorldReferenceV1 } from "../../types/index";
import { validateWorldSourcePurposeProofV1 } from "../../world-engine/source-purpose-contract";
import { parseTtrpgAuthoringSettingsV2, type TtrpgAuthoringSettingsV2 } from "./authoring-contract-v2";
import type { RulePackV2 } from "./open-contract";
import { parseRulePackV2 } from "./rule-pack-v2";
import { assertTtrpgOpenAuthoringSeatPlanCurrentV1 } from './open-authoring-seat-plan';

/** Detached open handoff only. No DB writes, start command or model execution. */
export interface TtrpgProductionBriefContentV3 {
  schema: "storyforge.ttrpg-production-brief";
  version: 3;
  runFormat: "open";
  settingsRevision: number;
  settings: Extract<TtrpgAuthoringSettingsV2, { runFormat: "open" }>;
  rulePack: RulePackV2;
  rulePackHash: string;
  worldReference: WorldReferenceV1;
  sourcePlan: ProductSourcePlanV1;
  compatibleOpeningRevision?: TtrpgCompatibleOpeningRevision;
}

const CONTENT_FIELDS = [
  "schema", "version", "runFormat", "settingsRevision", "settings",
  "rulePack", "rulePackHash", "worldReference", "sourcePlan",
] as const;
function contentFields(value: unknown): string[] {
  return [...CONTENT_FIELDS, ...(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'compatibleOpeningRevision') ? ['compatibleOpeningRevision'] : [])];
}
const HASH = /^[a-f0-9]{64}$/;

function fail(message: string): never {
  throw new Error(`[ttrpg-brief-v3] ${message}`);
}
function object(value: unknown, fields: readonly string[], label: string, optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} 必须是对象`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !fields.includes(key) && !optional.includes(key)) ||
    fields.some((key) => !Object.prototype.hasOwnProperty.call(row, key))) fail(`${label} 含未知字段或缺少必填字段`);
  return row;
}
function integer(value: unknown, minimum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) fail(`${label} 无效`);
  return value as number;
}
function parseWorldReferenceShape(input: unknown): WorldReferenceV1 {
  const row = object(input, [
    "schema", "version", "worldCode", "releaseUid", "releaseVersion", "releaseHash",
    "localReleaseRecordId", "manifestIdentity", "capabilityIdentity", "referenceHash",
  ], "WorldReference");
  object(row.manifestIdentity, ["schema", "version", "semanticContract", "schemaHash"], "manifestIdentity");
  object(row.capabilityIdentity, ["catalogHash", "profileHash"], "capabilityIdentity");
  return row as unknown as WorldReferenceV1;
}

/** Shape parsing is synchronous for the shared production envelope. It does not grant source rights or prove hashes. */
export function parseTtrpgProductionBriefContentShapeV3(input: unknown): TtrpgProductionBriefContentV3 {
  const row = object(input, contentFields(input), "Brief V3");
  if (row.schema !== "storyforge.ttrpg-production-brief" || row.version !== 3 || row.runFormat !== "open")
    fail("schema/version/runFormat 无效，Brief V3 只接受 open");
  const settingsRevision = integer(row.settingsRevision, 0, "Settings revision");
  const settings = parseTtrpgAuthoringSettingsV2(row.settings);
  if (settings.runFormat !== "open") fail("Brief V3 必须冻结 open Settings V2");
  // The frozen rule payload, not a host-local rule row, owns the rule identity.
  if (settings.wizard.savedRulePackId !== null) fail("冻结 Settings 不得含本地规则行 ID");
  if (!settings.openingSituation.trim() || !settings.playerRole.trim() || !settings.wizard.confirmAll)
    fail("正式 Brief 缺少开场、玩家身份或作者确认");
  const authoring = settings.openAuthoring;
  if (!authoring.companionPolicy || !authoring.stageClosurePolicy || !authoring.runtimePolicy ||
    !authoring.situationTemplates.length || !authoring.openingSituationKeys.length)
    fail("正式 Brief 的 openAuthoring 尚未完成");
  if (settings.authoringSeatPlan) assertTtrpgOpenAuthoringSeatPlanCurrentV1({ plan: settings.authoringSeatPlan,
    seats: settings.wizard.seats, companionPolicy: authoring.companionPolicy });
  const templates = new Set(authoring.situationTemplates.map((item) => item.templateKey));
  if (authoring.openingSituationKeys.some((key) => !templates.has(key)))
    fail("开局局势引用不存在");
  if (authoring.factPolicy.some((item) => !item.authorConfirmed))
    fail("正式 Brief 的事实候选尚未经作者确认");
  const rulePack = parseRulePackV2(row.rulePack);
  if (typeof row.rulePackHash !== "string" || !HASH.test(row.rulePackHash))
    fail("RulePack V2 canonical hash 不一致");
  const worldReference = parseWorldReferenceShape(row.worldReference);
  const planRow = object(row.sourcePlan, [
    "schema", "version", "productType", "productInstanceKey", "worldReference", "adapter",
    "requirements", "initialResourceKeys", "permission", "gatewayPolicy", "gatewayPolicyHash",
    "missingStrategy", "consultationContextManifests", "readiness", "createdAt", "planHash",
  ], "SourcePlan", ["sourcePurpose"]);
  parseWorldReferenceShape(planRow.worldReference);
  const sourcePlan = planRow as unknown as ProductSourcePlanV1;
  if (sourcePlan.schema !== 'storyforge.product-source-plan' || sourcePlan.version !== 1
    || sourcePlan.productType !== "ttrpg" || sourcePlan.adapter?.productType !== "ttrpg" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(sourcePlan.productInstanceKey))
    fail("SourcePlan 不属于有效的 ttrpg production");
  if (Object.prototype.hasOwnProperty.call(planRow, "sourcePurpose"))
    validateWorldSourcePurposeProofV1(planRow.sourcePurpose, sourcePlan.worldReference, "ttrpg");
  if (sourcePlan.readiness === "blocked" || !Array.isArray(sourcePlan.initialResourceKeys) || !sourcePlan.initialResourceKeys.length)
    fail("SourcePlan 尚未就绪");
  if (worldReference.referenceHash !== sourcePlan.worldReference.referenceHash ||
    worldReference.localReleaseRecordId !== sourcePlan.worldReference.localReleaseRecordId)
    fail("WorldReference 与 SourcePlan 不一致");
  return {
    schema: "storyforge.ttrpg-production-brief",
    version: 3,
    runFormat: "open",
    settingsRevision,
    settings,
    rulePack,
    rulePackHash: row.rulePackHash,
    worldReference,
    sourcePlan,
    ...(Object.prototype.hasOwnProperty.call(row, 'compatibleOpeningRevision') ? { compatibleOpeningRevision: parseTtrpgCompatibleOpeningRevision(row.compatibleOpeningRevision) } : {}),
  };
}
