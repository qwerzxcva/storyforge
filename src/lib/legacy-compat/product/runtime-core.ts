
import { normalizeProductRuntimeCheckpointPurposeV1 } from "./runtime-checkpoint-purpose";
import { assertProductOwnedRuntimeInvariantsV1 } from './runtime-product-adapters';
/** Product-neutral session, event-log, checkpoint and projection infrastructure. */
import Dexie from "dexie";
import { createProductRuntimeHeadParsingV1 } from "./runtime-head-parsing";
import { db } from "../../db/schema";
import { evaluateNarrativeChoices, applyNarrativeChoiceEffects } from "../../product/narrative-content";
import { assertProductRuntimeIntegerV1, isProductRuntimeJsonObjectV1, stableProductRuntimeJsonV1, type ProductRuntimeJsonObjectV1 } from "./runtime-values";
import { parseNarrativeCondition, parseNarrativeEffects, evaluateNarrativeCondition, applyNarrativeEffects } from "../../narrative/blueprint";
import { type ProductRuntimeKind, type ProductRuntimeState, type FrozenNarrativeBeat, NARRATIVE_BEAT_KINDS, type FrozenNarrativeChoice, type ProductNarrativeRuntimeNodeSnapshot, NARRATIVE_NODE_KINDS, type ProductNarrativeRuntimeState, NARRATIVE_MODULE_KINDS, type NarrativeChoiceHistoryEntry, type RuntimeAttributes, type RuntimeEntityState, RUNTIME_ENTITY_KINDS, RUNTIME_LIFECYCLE_STATUSES, type RuntimeMemory, type ProductRuntimeEvent, PRODUCT_RUNTIME_EVENT_TYPES, type ProductRuntimeSession, EMPTY_PRODUCT_RUNTIME_STATE, type AnyProductRuntimePackage, type ProductRuntimeCheckpoint, type ProductRuntimeCheckpointPurposeV1 } from "../../types/index";
import { verifyProductRuntimeSessionSourceV1 } from "../product-production/preview-source";
import { applyProductOwnedRuntimeEventV1, assertFrozenProductRuntimeStateV1, parseProductOwnedRuntimeStateV1, verifyProductOwnedBranchOriginV1 } from "./runtime-product-adapters";
export type JsonObject = ProductRuntimeJsonObjectV1;
export const stableJson = stableProductRuntimeJsonV1;

export interface CreateProductRuntimeSessionInput {
  projectId: number;
  worldGroupId?: number | null;
  kind: ProductRuntimeKind;
  title: string;
  seed?: string;
  canonSnapshot?: unknown;
  initialState?: ProductRuntimeState;
}

export const isObject = isProductRuntimeJsonObjectV1;

function parseJsonObject(value: string, label: string): JsonObject {
  try {
    const parsed = JSON.parse(value);
    if (!isObject(parsed)) throw new Error(`${label} 必须是 JSON 对象。`);
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.endsWith("必须是 JSON 对象。"))
      throw error;
    throw new Error(`${label} 不是合法 JSON。`);
  }
}

export const assertFiniteInteger = assertProductRuntimeIntegerV1;

function narrativeKeyArray(
  value: unknown,
  label: string,
  keys?: Set<string>,
  allowDuplicates = false,
): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组。`);
  const result = value.map((item) => String(item).trim());
  if (
    result.some((item) => !item || item.length > 200) ||
    (!allowDuplicates && new Set(result).size !== result.length)
  ) {
    throw new Error(`${label} 包含空值、超长值或重复值。`);
  }
  if (keys && result.some((item) => !keys.has(item)))
    throw new Error(`${label} 引用了不存在的叙事节点。`);
  return result;
}

function narrativeTextArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组。`);
  const result = value.map((item) => String(item).trim());
  if (
    result.some((item) => !item || item.length > 100) ||
    new Set(result).size !== result.length
  ) {
    throw new Error(`${label} 包含空值、超长值或重复值。`);
  }
  return result;
}

function parseFrozenNarrativeBeat(
  value: unknown,
  nodeKeys: Set<string>,
): FrozenNarrativeBeat {
  if (!isObject(value)) throw new Error("冻结 Beat 必须是对象。");
  const beatKey = String(value.beatKey ?? "").trim();
  const nodeKey = String(value.nodeKey ?? "").trim();
  const kind = String(value.kind ?? "");
  const speakerKey =
    value.speakerKey == null ? null : String(value.speakerKey).trim();
  const text = String(value.text ?? "");
  if (!beatKey || beatKey.length > 200 || !/^[a-zA-Z0-9._:-]+$/.test(beatKey))
    throw new Error("冻结 Beat key 无效。");
  if (!nodeKeys.has(nodeKey))
    throw new Error(`冻结 Beat 节点不存在: ${beatKey}`);
  if (!NARRATIVE_BEAT_KINDS.includes(kind as FrozenNarrativeBeat["kind"]))
    throw new Error(`冻结 Beat 类型无效: ${beatKey}`);
  if (kind === "dialogue" && !speakerKey)
    throw new Error(`冻结对话 Beat 缺少 speaker: ${beatKey}`);
  if (!text.trim() || text.length > 40_000)
    throw new Error(`冻结 Beat 文本无效: ${beatKey}`);
  return {
    beatKey,
    nodeKey,
    kind: kind as FrozenNarrativeBeat["kind"],
    speakerKey,
    text,
    order: assertFiniteInteger(
      value.order,
      `${beatKey}.order`,
      -1_000_000,
      1_000_000,
    ),
  };
}

function parseFrozenNarrativeChoice(
  value: unknown,
  nodeKeys: Set<string>,
): FrozenNarrativeChoice {
  if (!isObject(value)) throw new Error("冻结 Choice 必须是对象。");
  const choiceKey = String(value.choiceKey ?? "").trim();
  const sourceNodeKey = String(value.sourceNodeKey ?? "").trim();
  const targetNodeKey = String(value.targetNodeKey ?? "").trim();
  const text = String(value.text ?? "");
  const description = String(value.description ?? "");
  const unavailableReason = String(value.unavailableReason ?? "");
  const displayConditionJson = String(value.displayConditionJson ?? "{}");
  const availableConditionJson = String(value.availableConditionJson ?? "{}");
  const effectsJson = String(value.effectsJson ?? "[]");
  if (
    !choiceKey ||
    choiceKey.length > 200 ||
    !/^[a-zA-Z0-9._:-]+$/.test(choiceKey)
  )
    throw new Error("冻结 Choice key 无效。");
  if (!nodeKeys.has(sourceNodeKey) || !nodeKeys.has(targetNodeKey))
    throw new Error(`冻结 Choice 节点不存在: ${choiceKey}`);
  if (
    !text.trim() ||
    text.length > 4_000 ||
    description.length > 20_000 ||
    unavailableReason.length > 4_000
  ) {
    throw new Error(`冻结 Choice 内容无效: ${choiceKey}`);
  }
  parseNarrativeCondition(displayConditionJson);
  parseNarrativeCondition(availableConditionJson);
  parseNarrativeEffects(effectsJson);
  const tags = narrativeTextArray(value.tags, `${choiceKey}.tags`);
  return {
    choiceKey,
    sourceNodeKey,
    text,
    description,
    unavailableReason,
    targetNodeKey,
    displayConditionJson,
    availableConditionJson,
    effectsJson,
    tags,
    order: assertFiniteInteger(
      value.order,
      `${choiceKey}.order`,
      -1_000_000,
      1_000_000,
    ),
  };
}

function parseProductNarrativeRuntimeNode(
  value: unknown,
): ProductNarrativeRuntimeNodeSnapshot {
  if (!isObject(value)) throw new Error("冻结叙事节点必须是对象。");
  const key = String(value.key ?? "").trim();
  const kind = String(value.kind ?? "");
  const title = String(value.title ?? "").trim();
  const summary = String(value.summary ?? "").trim();
  const conditionJson = String(value.conditionJson ?? "{}");
  const effectsJson = String(value.effectsJson ?? "[]");
  if (!key || key.length > 200 || !/^[a-zA-Z0-9._:-]+$/.test(key))
    throw new Error("冻结叙事节点 key 无效。");
  if (
    !NARRATIVE_NODE_KINDS.includes(
      kind as (typeof NARRATIVE_NODE_KINDS)[number],
    )
  )
    throw new Error(`冻结叙事节点类型无效: ${kind}`);
  if (!title || title.length > 500 || summary.length > 20_000)
    throw new Error(`冻结叙事节点内容无效: ${key}`);
  parseNarrativeCondition(conditionJson);
  parseNarrativeEffects(effectsJson);
  return {
    key,
    kind: kind as ProductNarrativeRuntimeNodeSnapshot["kind"],
    title,
    summary,
    conditionJson,
    effectsJson,
    successorKeys: narrativeKeyArray(
      value.successorKeys,
      `${key}.successorKeys`,
    ),
  };
}

function parseProductNarrativeRuntimeState(
  value: unknown,
): ProductNarrativeRuntimeState | null {
  if (value == null) return null;
  if (
    !isObject(value) ||
    value.schema !== "storyforge.product-narrative-runtime" ||
    value.version !== 2
  ) {
    throw new Error("不支持的冻结叙事状态。");
  }
  if (
    !Array.isArray(value.nodes) ||
    value.nodes.length === 0 ||
    value.nodes.length > 5_000
  ) {
    throw new Error("冻结叙事必须包含 1..5000 个节点。");
  }
  const nodes = value.nodes.map(parseProductNarrativeRuntimeNode);
  const keys = new Set(nodes.map((node) => node.key));
  if (keys.size !== nodes.length)
    throw new Error("冻结叙事节点 key 不能重复。");
  for (const node of nodes) {
    if (node.successorKeys.some((key) => !keys.has(key)))
      throw new Error(`冻结叙事节点 ${node.key} 存在悬空后继。`);
  }
  const moduleKind = String(value.moduleKind ?? "");
  const moduleTitle = String(value.moduleTitle ?? "").trim();
  const sourceHash = String(value.sourceHash ?? "").trim();
  if (
    !NARRATIVE_MODULE_KINDS.includes(
      moduleKind as (typeof NARRATIVE_MODULE_KINDS)[number],
    )
  )
    throw new Error("冻结叙事模块类型无效。");
  if (
    !moduleTitle ||
    moduleTitle.length > 500 ||
    !sourceHash ||
    sourceHash.length > 128
  )
    throw new Error("冻结叙事模块身份无效。");
  const currentNodeKey =
    value.currentNodeKey == null ? null : String(value.currentNodeKey).trim();
  if (currentNodeKey != null && !keys.has(currentNodeKey))
    throw new Error("冻结叙事当前节点不存在。");
  if (!isObject(value.variables)) throw new Error("冻结叙事变量必须是对象。");
  if (typeof value.completed !== "boolean")
    throw new Error("冻结叙事完成状态无效。");
  const common = {
    schema: "storyforge.product-narrative-runtime" as const,
    version: 2 as const,
    moduleKind: moduleKind as ProductNarrativeRuntimeState["moduleKind"],
    moduleTitle,
    sourceHash,
    nodes,
    currentNodeKey,
    visitedNodeKeys: narrativeKeyArray(
      value.visitedNodeKeys,
      "叙事已访问节点",
      keys,
      true,
    ),
    availableNodeKeys: narrativeKeyArray(
      value.availableNodeKeys,
      "叙事可选节点",
      keys,
    ),
    variables: structuredClone(value.variables),
    completed: value.completed,
  };
  const contentHash = String(value.contentHash ?? "").trim();
  if (!/^[a-f0-9]{64}$/.test(contentHash))
    throw new Error("冻结游戏发布身份无效。");
  if (!Array.isArray(value.beats) || value.beats.length > 50_000)
    throw new Error("冻结 Beat 列表无效。");
  if (!Array.isArray(value.choices) || value.choices.length > 50_000)
    throw new Error("冻结 Choice 列表无效。");
  const beats = value.beats.map((beat) => parseFrozenNarrativeBeat(beat, keys));
  const choices = value.choices.map((choice) =>
    parseFrozenNarrativeChoice(choice, keys),
  );
  const choiceKeys = new Set(choices.map((choice) => choice.choiceKey));
  if (choiceKeys.size !== choices.length)
    throw new Error("冻结 Choice key 不能重复。");
  const visibleChoiceKeys = narrativeKeyArray(
    value.visibleChoiceKeys,
    "可见 Choice",
  );
  const availableChoiceKeys = narrativeKeyArray(
    value.availableChoiceKeys,
    "可用 Choice",
  );
  if (
    visibleChoiceKeys.some((key) => !choiceKeys.has(key)) ||
    availableChoiceKeys.some((key) => !choiceKeys.has(key))
  ) {
    throw new Error("冻结叙事 Choice 状态引用不存在。");
  }
  if (availableChoiceKeys.some((key) => !visibleChoiceKeys.includes(key)))
    throw new Error("可用 Choice 必须可见。");
  if (!Array.isArray(value.choiceHistory))
    throw new Error("冻结叙事选择历史必须是数组。");
  const choiceHistory: NarrativeChoiceHistoryEntry[] = value.choiceHistory.map(
    (raw) => {
      if (!isObject(raw)) throw new Error("冻结叙事选择历史记录无效。");
      const choiceKey = String(raw.choiceKey ?? "").trim();
      const fromNodeKey = String(raw.fromNodeKey ?? "").trim();
      const toNodeKey = String(raw.toNodeKey ?? "").trim();
      if (
        !choiceKeys.has(choiceKey) ||
        !keys.has(fromNodeKey) ||
        !keys.has(toNodeKey)
      ) {
        throw new Error("冻结叙事选择历史引用不存在。");
      }
      return {
        eventSequence: assertFiniteInteger(
          raw.eventSequence,
          "选择事件序号",
          1,
          Number.MAX_SAFE_INTEGER,
        ),
        choiceKey,
        fromNodeKey,
        toNodeKey,
      };
    },
  );
  const endingKey =
    value.endingKey == null ? null : String(value.endingKey).trim();
  if (endingKey != null && !keys.has(endingKey))
    throw new Error("冻结叙事结局节点不存在。");
  const completedAtSequence =
    value.completedAtSequence == null
      ? null
      : assertFiniteInteger(
          value.completedAtSequence,
          "叙事完成事件序号",
          0,
          Number.MAX_SAFE_INTEGER,
        );
  if (
    value.completed !== (endingKey != null) ||
    (value.completed && completedAtSequence == null)
  ) {
    throw new Error("冻结叙事完成状态不一致。");
  }
  const lastEnteredNodeSequence =
    value.lastEnteredNodeSequence == null
      ? null
      : assertFiniteInteger(
          value.lastEnteredNodeSequence,
          "最后节点进入序号",
          1,
          Number.MAX_SAFE_INTEGER,
        );
  const evaluations =
    currentNodeKey == null || value.completed
      ? []
      : evaluateNarrativeChoices(
          {
            ...common.variables,
            __visitedNodeKeys: common.visitedNodeKeys,
            __selectedChoiceKeys: choiceHistory.map((item) => item.choiceKey),
          },
          currentNodeKey,
          choices,
        );
  const expectedVisible = evaluations
    .filter((choice) => choice.visible)
    .map((choice) => choice.choiceKey);
  const expectedAvailable = evaluations
    .filter((choice) => choice.available)
    .map((choice) => choice.choiceKey);
  if (
    JSON.stringify(visibleChoiceKeys) !== JSON.stringify(expectedVisible) ||
    JSON.stringify(availableChoiceKeys) !== JSON.stringify(expectedAvailable)
  ) {
    throw new Error("冻结叙事 Choice 投影与变量状态不一致。");
  }
  return {
    ...common,
    contentHash,
    beats,
    choices,
    visibleChoiceKeys,
    availableChoiceKeys,
    choiceHistory,
    endingKey,
    completedAtSequence,
    lastEnteredNodeSequence,
  };
}

export function enterFrozenNarrativeNode(
  narrative: ProductNarrativeRuntimeState,
  targetKey: string,
  options: {
    variables?: Record<string, unknown>;
    eventSequence?: number;
    selectedChoiceKey?: string;
  } = {},
): ProductNarrativeRuntimeState {
  const target = narrative.nodes.find((node) => node.key === targetKey);
  if (!target) throw new Error(`冻结叙事节点不存在: ${targetKey}`);
  const sourceVariables = options.variables ?? narrative.variables;
  const predicateVariables = {
    ...sourceVariables,
    __visitedNodeKeys: narrative.visitedNodeKeys,
    __selectedChoiceKeys: [
      ...(narrative.choiceHistory ?? []).map((item) => item.choiceKey),
      ...(options.selectedChoiceKey ? [options.selectedChoiceKey] : []),
    ],
  };
  if (
    !evaluateNarrativeCondition(
      parseNarrativeCondition(target.conditionJson),
      predicateVariables,
    )
  ) {
    throw new Error(`冻结叙事节点条件未满足: ${targetKey}`);
  }
  const variables = applyNarrativeEffects(
    parseNarrativeEffects(target.effectsJson),
    sourceVariables,
  );
  const choiceVariables = {
    ...variables,
    __visitedNodeKeys: [...narrative.visitedNodeKeys, targetKey],
    __selectedChoiceKeys: predicateVariables.__selectedChoiceKeys,
  };
  const completed = target.kind === "ending";
  const choiceEvaluations =
    narrative.version === 2 && !completed
      ? evaluateNarrativeChoices(
          choiceVariables,
          targetKey,
          narrative.choices ?? [],
        )
      : [];
  const availableNodeKeys =
    narrative.version === 2
      ? [
          ...new Set(
            choiceEvaluations
              .filter((choice) => choice.available)
              .map((choice) => choice.targetNodeKey),
          ),
        ]
      : target.successorKeys.filter((key) => {
          const node = narrative.nodes.find(
            (candidate) => candidate.key === key,
          )!;
          return evaluateNarrativeCondition(
            parseNarrativeCondition(node.conditionJson),
            variables,
          );
        });
  return {
    ...narrative,
    currentNodeKey: targetKey,
    visitedNodeKeys: [...narrative.visitedNodeKeys, targetKey],
    availableNodeKeys,
    variables,
    completed,
    ...(narrative.version === 2
      ? {
          visibleChoiceKeys: choiceEvaluations
            .filter((choice) => choice.visible)
            .map((choice) => choice.choiceKey),
          availableChoiceKeys: choiceEvaluations
            .filter((choice) => choice.available)
            .map((choice) => choice.choiceKey),
          endingKey: completed ? targetKey : null,
          completedAtSequence: completed
            ? (options.eventSequence ?? null)
            : null,
        }
      : {}),
  };
}

/**
 * Apply one choice with the exact same deterministic semantics used by the
 * persisted event reducer. Authoring preview reuses this helper but never
 * writes a session or an event.
 */
export function advanceFrozenNarrativeChoice(
  narrative: ProductNarrativeRuntimeState,
  choiceKey: string,
  eventSequence: number,
): ProductNarrativeRuntimeState {
  if (
    narrative.version !== 2 ||
    narrative.completed ||
    !narrative.currentNodeKey
  ) {
    throw new Error("当前叙事没有可提交选择的内容。");
  }
  if (!narrative.availableChoiceKeys?.includes(choiceKey))
    throw new Error("所选 Choice 当前不可用。");
  const choice = narrative.choices?.find(
    (item) => item.choiceKey === choiceKey,
  );
  if (!choice || choice.sourceNodeKey !== narrative.currentNodeKey)
    throw new Error("所选 Choice 不属于当前节点。");
  const fromNodeKey = narrative.currentNodeKey;
  const variables = applyNarrativeChoiceEffects(choice, narrative.variables);
  const entered = enterFrozenNarrativeNode(narrative, choice.targetNodeKey, {
    variables,
    eventSequence,
    selectedChoiceKey: choiceKey,
  });
  return {
    ...entered,
    choiceHistory: [
      ...(narrative.choiceHistory ?? []),
      {
        eventSequence,
        choiceKey,
        fromNodeKey,
        toNodeKey: choice.targetNodeKey,
      },
    ],
  };
}

function assertRuntimeAttributes(value: unknown): RuntimeAttributes {
  if (!isObject(value)) throw new Error("运行时 attributes 必须是对象。");
  const result: RuntimeAttributes = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!key.trim() || key.length > 80) throw new Error("运行时属性键无效。");
    if (raw !== null && !["string", "number", "boolean"].includes(typeof raw)) {
      throw new Error(`运行时属性 ${key} 只能是标量。`);
    }
    if (typeof raw === "number" && !Number.isFinite(raw)) {
      throw new Error(`运行时属性 ${key} 不是有限数字。`);
    }
    result[key] = raw as RuntimeAttributes[string];
  }
  return result;
}

function assertRuntimeEntity(value: unknown): RuntimeEntityState {
  if (!isObject(value)) throw new Error("运行时实体必须是对象。");
  const entityKey = String(value.entityKey ?? "").trim();
  const name = String(value.name ?? "").trim();
  const kind = String(value.kind ?? "");
  const lifecycleStatus = String(value.lifecycleStatus ?? "");
  if (!entityKey || entityKey.length > 160)
    throw new Error("运行时实体缺少有效 entityKey。");
  if (!name || name.length > 200) throw new Error("运行时实体缺少有效名称。");
  if (!RUNTIME_ENTITY_KINDS.includes(kind as RuntimeEntityState["kind"])) {
    throw new Error(`未知运行时实体类型: ${kind}`);
  }
  if (
    !RUNTIME_LIFECYCLE_STATUSES.includes(
      lifecycleStatus as RuntimeEntityState["lifecycleStatus"],
    )
  ) {
    throw new Error(`未知运行时生命周期: ${lifecycleStatus}`);
  }
  const sourceId =
    value.sourceId == null
      ? null
      : assertFiniteInteger(
          value.sourceId,
          "sourceId",
          1,
          Number.MAX_SAFE_INTEGER,
        );
  const locationKey =
    value.locationKey == null ? null : String(value.locationKey).trim() || null;
  return {
    entityKey,
    kind: kind as RuntimeEntityState["kind"],
    sourceId,
    name,
    locationKey,
    lifecycleStatus: lifecycleStatus as RuntimeEntityState["lifecycleStatus"],
    attributes: assertRuntimeAttributes(value.attributes ?? {}),
  };
}

function assertRuntimeMemory(value: unknown): RuntimeMemory {
  if (!isObject(value)) throw new Error("运行时记忆必须是对象。");
  const id = String(value.id ?? "").trim();
  const subjectKey = String(value.subjectKey ?? "").trim();
  const content = String(value.content ?? "").trim();
  const status = String(value.status ?? "");
  if (!id || id.length > 160) throw new Error("运行时记忆缺少有效 id。");
  if (!subjectKey || subjectKey.length > 160)
    throw new Error("运行时记忆缺少主体。");
  if (!content || content.length > 4_000)
    throw new Error("运行时记忆内容无效。");
  if (!["known", "mistaken", "forgotten"].includes(status)) {
    throw new Error(`未知运行时记忆状态: ${status}`);
  }
  return {
    id,
    subjectKey,
    content,
    status: status as RuntimeMemory["status"],
    sourceEventSequence: assertFiniteInteger(
      value.sourceEventSequence,
      "sourceEventSequence",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

export function parseProductRuntimeState(
  value: string | ProductRuntimeState,
): ProductRuntimeState {
  const parsed =
    typeof value === "string" ? parseJsonObject(value, "运行时状态") : value;
  if (parsed.version !== 1) throw new Error("不支持的运行时状态版本。");
  const clock = assertFiniteInteger(
    parsed.clock,
    "运行时时钟",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const lastSequence = assertFiniteInteger(
    parsed.lastSequence,
    "lastSequence",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (!isObject(parsed.entities))
    throw new Error("运行时 entities 必须是对象。");
  const entities: Record<string, RuntimeEntityState> = {};
  for (const [key, raw] of Object.entries(parsed.entities)) {
    const entity = assertRuntimeEntity(raw);
    if (entity.entityKey !== key)
      throw new Error(`实体索引与 entityKey 不一致: ${key}`);
    entities[key] = entity;
  }
  if (!Array.isArray(parsed.memories))
    throw new Error("运行时 memories 必须是数组。");
  if (!Array.isArray(parsed.narratives))
    throw new Error("运行时 narratives 必须是数组。");
  const memories = parsed.memories.map(assertRuntimeMemory);
  const narratives = parsed.narratives.map((raw) => {
    if (!isObject(raw)) throw new Error("运行时叙事记录必须是对象。");
    const text = String(raw.text ?? "").trim();
    if (!text || text.length > 20_000) throw new Error("运行时叙事文本无效。");
    return {
      eventSequence: assertFiniteInteger(
        raw.eventSequence,
        "narrative.eventSequence",
        1,
        Number.MAX_SAFE_INTEGER,
      ),
      text,
    };
  });
  return {
    version: 1,
    clock,
    entities,
    memories,
    narratives,
    narrative: parseProductNarrativeRuntimeState(parsed.narrative),
    ...parseProductOwnedRuntimeStateV1(parsed as ProductRuntimeState),
    lastSequence,
  };
}

export function cloneState(state: ProductRuntimeState): ProductRuntimeState {
  return structuredClone(state);
}

export function parseEventPayload(event: ProductRuntimeEvent): JsonObject {
  if (!PRODUCT_RUNTIME_EVENT_TYPES.includes(event.type)) {
    throw new Error(`未知演化事件类型: ${event.type}`);
  }
  return parseJsonObject(event.payloadJson, `演化事件 ${event.type}`);
}

function reduceProductRuntimeEvent(
  current: ProductRuntimeState,
  event: ProductRuntimeEvent,
  trustedMutableState: boolean,
): ProductRuntimeState {
  // Public single-event application remains immutable and validates its input.
  // replayProductRuntimeEvents owns a freshly parsed clone, so parsing and
  // cloning that entire state again for every event would make replay O(events
  // * state-size). Its private mutable path keeps the same event validation and
  // reducer logic while reducing an exclusively owned state in place.
  const state = trustedMutableState
    ? current
    : cloneState(parseProductRuntimeState(current));
  if (event.sequence !== state.lastSequence + 1) {
    throw new Error(
      `演化事件序号不连续: 期望 ${state.lastSequence + 1}，收到 ${event.sequence}`,
    );
  }
  const payload = parseEventPayload(event);
  const productState = applyProductOwnedRuntimeEventV1(state, event, payload);
  if (productState) { assertProductOwnedRuntimeInvariantsV1(productState); return productState; }
  switch (event.type) {
    case "time.advanced": {
      const amount = assertFiniteInteger(
        payload.amount,
        "时间推进量",
        1,
        1_000_000_000,
      );
      if (state.clock + amount > Number.MAX_SAFE_INTEGER)
        throw new Error("运行时时钟溢出。");
      state.clock += amount;
      break;
    }
    case "entity.upserted": {
      const entity = assertRuntimeEntity(payload.entity);
      state.entities[entity.entityKey] = entity;
      break;
    }
    case "entity.patched": {
      const entityKey = String(payload.entityKey ?? "").trim();
      const existing = state.entities[entityKey];
      if (!existing) throw new Error(`运行时实体不存在: ${entityKey}`);
      if (!isObject(payload.patch)) throw new Error("实体补丁必须是对象。");
      const allowed = new Set([
        "name",
        "locationKey",
        "lifecycleStatus",
        "attributes",
      ]);
      for (const key of Object.keys(payload.patch)) {
        if (!allowed.has(key)) throw new Error(`实体补丁禁止字段: ${key}`);
      }
      state.entities[entityKey] = assertRuntimeEntity({
        ...existing,
        ...payload.patch,
        entityKey,
        kind: existing.kind,
        sourceId: existing.sourceId,
        attributes:
          payload.patch.attributes == null
            ? existing.attributes
            : {
                ...existing.attributes,
                ...assertRuntimeAttributes(payload.patch.attributes),
              },
      });
      break;
    }
    case "entity.removed": {
      const entityKey = String(payload.entityKey ?? "").trim();
      if (!state.entities[entityKey])
        throw new Error(`运行时实体不存在: ${entityKey}`);
      delete state.entities[entityKey];
      break;
    }
    case "memory.recorded": {
      const memory = assertRuntimeMemory(payload.memory);
      if (memory.sourceEventSequence !== event.sequence) {
        throw new Error("运行时记忆必须引用自身事件序号。");
      }
      const index = state.memories.findIndex((row) => row.id === memory.id);
      if (index >= 0) state.memories[index] = memory;
      else state.memories.push(memory);
      break;
    }
    case "narrative.recorded": {
      const text = String(payload.text ?? "").trim();
      if (!text || text.length > 20_000)
        throw new Error("运行时叙事文本无效。");
      state.narratives.push({ eventSequence: event.sequence, text });
      break;
    }
    case "narrative.started": {
      const narrative = state.narrative;
      if (
        !narrative ||
        narrative.version !== 2 ||
        !narrative.currentNodeKey ||
        event.sequence !== 1
      ) {
        throw new Error("ProductRelease 叙事启动事件无效。");
      }
      if (
        String(payload.entryNodeKey ?? "").trim() !==
          narrative.currentNodeKey ||
        String(payload.contentHash ?? "").trim() !== narrative.contentHash
      ) {
        throw new Error("叙事启动事件与冻结发布不一致。");
      }
      break;
    }
    case "narrative.node.entered": {
      const narrative = state.narrative;
      if (!narrative || narrative.version !== 2 || !narrative.currentNodeKey) {
        throw new Error("ProductRelease 节点进入事件无效。");
      }
      const nodeKey = String(payload.nodeKey ?? "").trim();
      const causeSequence = assertFiniteInteger(
        payload.causeSequence,
        "节点进入原因序号",
        1,
        event.sequence - 1,
      );
      if (nodeKey !== narrative.currentNodeKey)
        throw new Error("节点进入事件与当前冻结节点不一致。");
      if (event.sequence !== causeSequence + 1)
        throw new Error("节点进入事件没有紧随其状态变更。");
      if (
        causeSequence > 1 &&
        narrative.choiceHistory?.[narrative.choiceHistory.length - 1]
          ?.eventSequence !== causeSequence
      ) {
        throw new Error("节点进入事件缺少对应的 Choice。");
      }
      narrative.lastEnteredNodeSequence = event.sequence;
      // A node may legally point back to itself. Narrative state records a new
      // visit even when the stable node key is unchanged, so AVG presentation
      // must also start that visit before its first Beat. Without this reset a
      // self-loop inherited the prior visit's currentBeatKey and skipped the
      // entire scene on replay and in the live player.
      if (state.presentation) {
        state.presentation.currentNodeKey = nodeKey;
        state.presentation.currentBeatKey = null;
      }
      break;
    }
    case "narrative.choice.committed": {
      const narrative = state.narrative;
      if (
        !narrative ||
        narrative.version !== 2 ||
        narrative.completed ||
        !narrative.currentNodeKey
      ) {
        throw new Error("当前会话没有可提交选择的 ProductRelease 叙事。");
      }
      const commandId = String(payload.commandId ?? "").trim();
      const baseSequence = assertFiniteInteger(
        payload.baseSequence,
        "选择基准序号",
        0,
        Number.MAX_SAFE_INTEGER,
      );
      const baseStateHash = String(payload.baseStateHash ?? "").trim();
      const fromNodeKey = String(payload.fromNodeKey ?? "").trim();
      const choiceKey = String(payload.choiceKey ?? "").trim();
      const toNodeKey = String(payload.toNodeKey ?? "").trim();
      if (
        !commandId ||
        commandId.length > 200 ||
        !/^[a-zA-Z0-9._:-]+$/.test(commandId)
      )
        throw new Error("选择 commandId 无效。");
      if (!/^[a-f0-9]{64}$/.test(baseStateHash))
        throw new Error("选择 baseStateHash 无效。");
      if (baseSequence !== event.sequence - 1)
        throw new Error("选择基准序号与事件位置不一致。");
      if (fromNodeKey !== narrative.currentNodeKey)
        throw new Error("选择来源节点已变化。");
      if (!narrative.availableChoiceKeys?.includes(choiceKey))
        throw new Error("所选 Choice 当前不可用。");
      const choice = narrative.choices?.find(
        (item) => item.choiceKey === choiceKey,
      );
      if (
        !choice ||
        choice.sourceNodeKey !== fromNodeKey ||
        choice.targetNodeKey !== toNodeKey
      ) {
        throw new Error("选择与冻结内容不一致。");
      }
      state.narrative = advanceFrozenNarrativeChoice(
        narrative,
        choiceKey,
        event.sequence,
      );
      break;
    }
    case "narrative.ending.reached": {
      const narrative = state.narrative;
      const endingKey = String(payload.endingKey ?? "").trim();
      const enteredSequence = assertFiniteInteger(
        payload.enteredSequence,
        "结局进入序号",
        1,
        event.sequence - 1,
      );
      if (
        !narrative ||
        narrative.version !== 2 ||
        !narrative.completed ||
        narrative.currentNodeKey !== endingKey ||
        narrative.endingKey !== endingKey
      ) {
        throw new Error("结局事件与冻结叙事状态不一致。");
      }
      if (event.sequence !== enteredSequence + 1)
        throw new Error("结局事件没有紧随节点进入。");
      if (narrative.lastEnteredNodeSequence !== enteredSequence)
        throw new Error("结局事件引用的节点尚未正式进入。");
      narrative.completedAtSequence = event.sequence;
      break;
    }
  }
  state.lastSequence = event.sequence;
  assertProductOwnedRuntimeInvariantsV1(state);
  return state;
}

export function applyProductRuntimeEvent(
  current: ProductRuntimeState,
  event: ProductRuntimeEvent,
): ProductRuntimeState {
  return reduceProductRuntimeEvent(current, event, false);
}

interface VerifiedRuntimeReplayPrefixV1 {
  initialSource: string;
  eventSources: string[];
  state: ProductRuntimeState;
  retainedBytes: number;
}

// These values are private derivations of exact replay inputs, never a DB head.
// Limit both entry count and retained serialized UTF-16 input/state size.
const MAX_RUNTIME_REPLAY_PREFIX_BYTES_V1 = 12_000_000;
let verifiedRuntimeReplayPrefixesV1: VerifiedRuntimeReplayPrefixV1[] = [];

function runtimeReplaySnapshotSourceV1(value: unknown): string | null {
  try {
    let root = true;
    const source = JSON.stringify(value, function (key, entry: unknown) {
      const descriptor = root ? null : Object.getOwnPropertyDescriptor(this, key);
      const original = root ? value : descriptor?.value;
      root = false;
      if ((descriptor && !("value" in descriptor)) || !Object.is(original, entry)
        || Object.is(entry, -0)) throw new Error("not a lossless JSON snapshot");
      const type = typeof entry;
      if (type === "undefined" || type === "function" || type === "symbol"
        || type === "bigint" || (type === "number" && !Number.isFinite(entry))) {
        throw new Error("not a lossless JSON value");
      }
      if (entry !== null && type === "object") {
        const array = Array.isArray(entry);
        const prototype = Object.getPrototypeOf(entry);
        if ((!array && prototype !== Object.prototype && prototype !== null)
          || (array && prototype !== Array.prototype)
          || Object.getOwnPropertySymbols(entry).length > 0) throw new Error("not plain JSON");
        for (const name of Object.getOwnPropertyNames(entry)) {
          if (array && name === "length") continue;
          if (array && (!/^(?:0|[1-9]\d*)$/.test(name)
            || Number(name) >= (entry as unknown[]).length)) throw new Error("not a JSON array index");
          const property = Object.getOwnPropertyDescriptor(entry, name)!;
          if (!("value" in property) || !property.enumerable) throw new Error("not a data snapshot");
        }
      }
      return entry;
    });
    return source.length <= 2_000_000 ? source : null;
  } catch { return null; }
}

export function replayProductRuntimeEvents(
  initialState: ProductRuntimeState,
  events: readonly ProductRuntimeEvent[],
  throughSequence = Number.MAX_SAFE_INTEGER,
): ProductRuntimeState {
  const parsedInitialState = parseProductRuntimeState(initialState);
  const ordered = [...events]
    .filter((event) => event.sequence <= throughSequence)
    .sort((a, b) => a.sequence - b.sequence);
  const initialSource = runtimeReplaySnapshotSourceV1(parsedInitialState);
  let reusable = initialSource !== null;
  const eventSources: string[] = [];
  let sourceBytes = 2 * (initialSource?.length ?? 0);
  for (const event of ordered) {
    if (!reusable) break;
    const source = runtimeReplaySnapshotSourceV1(event);
    if (source === null || sourceBytes + 2 * source.length > MAX_RUNTIME_REPLAY_PREFIX_BYTES_V1) {
      reusable = false;
      eventSources.length = 0;
      break;
    }
    sourceBytes += 2 * source.length;
    eventSources.push(source);
  }
  const prefix = reusable ? verifiedRuntimeReplayPrefixesV1
    .filter((entry) => entry.initialSource === initialSource
      && entry.eventSources.length <= eventSources.length
      && entry.eventSources.every((source, index) => source === eventSources[index]))
    .sort((a, b) => b.eventSources.length - a.eventSources.length)[0] : undefined;
  let state = cloneState(prefix?.state ?? parsedInitialState);
  // Replay the exact data snapshot that identifies the reusable prefix. Exotic
  // inputs retain the original full replay path and cannot seed this cache.
  for (let index = prefix?.eventSources.length ?? 0; index < ordered.length; index += 1) {
    const event = reusable ? JSON.parse(eventSources[index]) as ProductRuntimeEvent : ordered[index];
    state = reduceProductRuntimeEvent(state, event, true);
  }
  if (reusable && initialSource !== null) {
    const retainedBytes = 2 * (initialSource.length
      + eventSources.reduce((sum, source) => sum + source.length, 0)
      + JSON.stringify(state).length);
    if (retainedBytes <= MAX_RUNTIME_REPLAY_PREFIX_BYTES_V1) {
      const entry = { initialSource, eventSources, state: cloneState(state), retainedBytes };
      verifiedRuntimeReplayPrefixesV1 = [entry, ...verifiedRuntimeReplayPrefixesV1
        .filter((previous) => previous !== prefix
          || previous.eventSources.length !== eventSources.length)].slice(0, 3);
      while (verifiedRuntimeReplayPrefixesV1.reduce((sum, item) => sum + item.retainedBytes, 0)
        > MAX_RUNTIME_REPLAY_PREFIX_BYTES_V1) verifiedRuntimeReplayPrefixesV1.pop();
    }
  }
  return state;
}

/** Async callers can retain exact-input SHA-256 proofs instead of megabytes of
 * repeated event payloads. The shared cache keeps the same aggregate byte cap.
 * All mutable inputs are snapshotted before the first await; only those frozen
 * bytes are hashed and replayed. No persisted head is used as replay authority.
 */
export async function replayProductRuntimeEventsVerifiedAsyncV1(
  initialState: ProductRuntimeState,
  events: readonly ProductRuntimeEvent[],
  throughSequence = Number.MAX_SAFE_INTEGER,
): Promise<ProductRuntimeState> {
  const parsedInitialState = parseProductRuntimeState(initialState);
  const ordered = [...events].filter(event => event.sequence <= throughSequence)
    .sort((a, b) => a.sequence - b.sequence);
  const initialSnapshot = runtimeReplaySnapshotSourceV1(parsedInitialState);
  if (initialSnapshot === null) return replayProductRuntimeEvents(initialState, events, throughSequence);
  const snapshots: string[] = [];
  for (const event of ordered) {
    const source = runtimeReplaySnapshotSourceV1(event);
    if (source === null) return replayProductRuntimeEvents(initialState, events, throughSequence);
    snapshots.push(source);
  }
  const initialSource = `sha256:${await hashStateJson(initialSnapshot)}`;
  const eventSources: string[] = [];
  for (let offset = 0; offset < snapshots.length; offset += 8) {
    eventSources.push(...await Promise.all(snapshots.slice(offset, offset + 8)
      .map(source => hashStateJson(source))));
  }
  const prefix = verifiedRuntimeReplayPrefixesV1
    .filter(entry => entry.initialSource === initialSource
      && entry.eventSources.length <= eventSources.length
      && entry.eventSources.every((source, index) => source === eventSources[index]))
    .sort((a, b) => b.eventSources.length - a.eventSources.length)[0];
  let state = cloneState(prefix?.state ?? JSON.parse(initialSnapshot) as ProductRuntimeState);
  for (let index = prefix?.eventSources.length ?? 0; index < snapshots.length; index += 1) {
    state = reduceProductRuntimeEvent(state, JSON.parse(snapshots[index]) as ProductRuntimeEvent, true);
  }
  const retainedBytes = 2 * (initialSource.length
    + eventSources.reduce((sum, source) => sum + source.length, 0)
    + JSON.stringify(state).length);
  if (retainedBytes <= MAX_RUNTIME_REPLAY_PREFIX_BYTES_V1) {
    const entry = { initialSource, eventSources, state: cloneState(state), retainedBytes };
    verifiedRuntimeReplayPrefixesV1 = [entry, ...verifiedRuntimeReplayPrefixesV1
      .filter(previous => previous !== prefix
        || previous.eventSources.length !== eventSources.length)].slice(0, 3);
    while (verifiedRuntimeReplayPrefixesV1.reduce((sum, item) => sum + item.retainedBytes, 0)
      > MAX_RUNTIME_REPLAY_PREFIX_BYTES_V1) verifiedRuntimeReplayPrefixesV1.pop();
  }
  return state;
}

export function assertFrozenRuntimePackageSessionV1(input: {
  session: Pick<CreateProductRuntimeSessionInput, "kind" | "initialState">;
  runtimePackage: AnyProductRuntimePackage;
  runtimeSourceHash: string;
  origin: "release" | "preview" | "branch";
}): void {
  const { runtimePackage, runtimeSourceHash } = input;
  if (
    input.session.kind !== runtimePackage.productType
  ) {
    throw new Error(`${runtimePackage.productType} 与会话类型不匹配。`);
  }
  const initial = parseProductRuntimeState(
    input.session.initialState ?? EMPTY_PRODUCT_RUNTIME_STATE,
  );
  const narrative = initial.narrative;
  const sourceMismatch =
    narrative?.version !== 2 ||
    narrative.contentHash !== runtimeSourceHash ||
    narrative.sourceHash !== runtimeSourceHash ||
    narrative.moduleKind !== runtimePackage.narrative.moduleKind ||
    narrative.moduleTitle !== runtimePackage.narrative.moduleTitle ||
    stableJson(narrative.nodes) !==
      stableJson(runtimePackage.narrative.nodes) ||
    stableJson(narrative.beats) !==
      stableJson(runtimePackage.narrative.beats) ||
    stableJson(narrative.choices) !==
      stableJson(runtimePackage.narrative.choices);
  const entryMismatch =
    input.origin !== "branch" &&
    narrative?.version === 2 &&
    (narrative.currentNodeKey !== runtimePackage.narrative.entryNodeKey ||
      narrative.choiceHistory?.length !== 0 ||
      narrative.visitedNodeKeys.length !== 1 ||
      narrative.visitedNodeKeys[0] !== runtimePackage.narrative.entryNodeKey);
  if (sourceMismatch || entryMismatch) {
    throw new Error("上层产品初始叙事必须来自绑定 RuntimePackage 的冻结内容。");
  }
  assertFrozenProductRuntimeStateV1({
    initial,
    runtimePackage,
    runtimeSourceHash,
    origin: input.origin,
  });
}

export async function readSessionEvents(
  session: ProductRuntimeSession,
  throughSequence = Number.MAX_SAFE_INTEGER,
): Promise<ProductRuntimeEvent[]> {
  const events = await db.productRuntimeEvents
    .where("sessionId")
    .equals(session.id!)
    .toArray();
  for (const event of events) {
    if (
      event.projectId !== session.projectId ||
      (event.worldGroupId ?? null) !== (session.worldGroupId ?? null)
    ) {
      throw new Error(`演化事件 ${event.id ?? "?"} 作用域与会话不一致。`);
    }
  }
  return events.filter((event) => event.sequence <= throughSequence);
}

interface ProductRuntimeHeadV1 {
  state: ProductRuntimeState;
  stateJson: string;
  stateHash: string;
  sequence: number;
  fromCache: boolean;
}

export async function readLatestSessionEventSequenceV1(
  sessionId: number,
): Promise<number> {
  const latest = await db.productRuntimeEvents
    .where("[sessionId+sequence]")
    .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
    .last();
  return latest?.sequence ?? 0;
}

async function verifyNativeAvgInitialSnapshot(session: ProductRuntimeSession): Promise<boolean> {
  if (session.kind !== 'avg') return false
  const initial = parseJsonObject(session.initialStateJson, 'initialStateJson')
  const canon = parseJsonObject(session.canonSnapshotJson, 'canonSnapshotJson')
  const nativeHint = Object.prototype.hasOwnProperty.call(initial, 'avgRules')
    || Object.prototype.hasOwnProperty.call(initial, 'avgReading') || canon.packageVersion === 2
  if (!nativeHint && session.productBuildId == null && session.productReleaseId == null) return false
  const source = await verifyProductRuntimeSessionSourceV1({ scope: { projectId: session.projectId, worldId: session.worldId, workId: session.workId }, session })
  // Initial data and the legacy hint are mutable storage, not authority to
  // skip the frozen native package guard and return a still-valid head cache.
  // Source verification has already rejected non-playable V2 carriers.
  if (!nativeHint && source.runtimePackage.version !== 2) return false
  if (session.runtimeSourceHash !== source.packageHash) throw new Error('[avg] 运行来源 hash 不一致')
  const branchOrigin = await verifyProductOwnedBranchOriginV1({ ...session, initialState: initial })
  assertFrozenRuntimePackageSessionV1({ session: { kind: session.kind, initialState: parseProductRuntimeState(session.initialStateJson) },
    runtimePackage: source.runtimePackage, runtimeSourceHash: source.packageHash,
    origin: session.parentSessionId != null || branchOrigin ? 'branch' : session.productBuildId != null ? 'preview' : 'release' })
  return true
}

const parseRuntimeHead = createProductRuntimeHeadParsingV1(
  parseProductRuntimeState,
  cloneState,
);

export async function readVerifiedProductRuntimeHeadV1(
  session: ProductRuntimeSession,
): Promise<ProductRuntimeHeadV1> {
  const latestSequence = await readLatestSessionEventSequenceV1(session.id!);
  const cachedJson = session.runtimeHeadStateJson;
  const cachedHash = session.runtimeHeadStateHash;
  const nativeAvg = await verifyNativeAvgInitialSnapshot(session)
  if (
    !nativeAvg &&
    session.runtimeHeadSequence === latestSequence &&
    typeof cachedJson === "string" &&
    typeof cachedHash === "string" &&
    /^[a-f0-9]{64}$/.test(cachedHash)
  ) {
    try {
      const state = parseRuntimeHead(cachedJson);
      if (
        state.lastSequence === latestSequence &&
        (await hashStateJson(cachedJson)) === cachedHash
      ) {
        return {
          state,
          stateJson: cachedJson,
          stateHash: cachedHash,
          sequence: latestSequence,
          fromCache: true,
        };
      }
    } catch {
      // The head is derived and recoverable. Fall through to canonical replay.
    }
  }
  const events = await readSessionEvents(session);
  const state = replayProductRuntimeEvents(
    parseProductRuntimeState(session.initialStateJson),
    events,
  );
  const stateJson = JSON.stringify(state);
  return {
    state,
    stateJson,
    stateHash: await hashStateJson(stateJson),
    sequence: state.lastSequence,
    fromCache: false,
  };
}

export async function readProductRuntimeState(
  sessionId: number,
  throughSequence = Number.MAX_SAFE_INTEGER,
): Promise<ProductRuntimeState> {
  const session = await db.productRuntimeSessions.get(sessionId);
  if (!session) throw new Error("产品运行会话不存在。");
  if (throughSequence === Number.MAX_SAFE_INTEGER) {
    return (await readVerifiedProductRuntimeHeadV1(session)).state;
  }
  await verifyNativeAvgInitialSnapshot(session)
  const events = await readSessionEvents(session, throughSequence);
  const initial = parseProductRuntimeState(session.initialStateJson);
  const replay = () => replayProductRuntimeEventsVerifiedAsyncV1(initial, events, throughSequence);
  return Dexie.currentTransaction
    ? Dexie.waitFor(Dexie.ignoreTransaction(replay))
    : replay();
}

export async function readProductRuntimeStateVersion(sessionId: number): Promise<{
  sequence: number;
  stateHash: string;
}> {
  const session = await db.productRuntimeSessions.get(sessionId);
  if (!session) throw new Error("产品运行会话不存在。");
  const head = await readVerifiedProductRuntimeHeadV1(session);
  return {
    sequence: head.sequence,
    stateHash: head.stateHash,
  };
}

/** Hash an already verified in-memory projection without replaying its event log again. */
export async function hashProductRuntimeStateV1(
  state: ProductRuntimeState,
): Promise<string> {
  return hashStateJson(JSON.stringify(state));
}

export async function hashStateJson(stateJson: string): Promise<string> {
  const data = new TextEncoder().encode(stateJson);
  const digestPromise = crypto.subtle.digest("SHA-256", data);
  const digest = Dexie.currentTransaction
    ? await Dexie.waitFor(digestPromise)
    : await digestPromise;
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export type NormalizedProductRuntimeCheckpointV1 = ProductRuntimeCheckpoint & {
  worldGroupId: number | null;
  purpose: ProductRuntimeCheckpointPurposeV1;
  subjectKey: string | null;
};

/** Strict persisted-row parser used by readers before trusting checkpoint data. */
export function parseProductRuntimeCheckpointV1(
  value: unknown,
): NormalizedProductRuntimeCheckpointV1 {
  if (!isObject(value)) throw new Error("检查点记录必须是对象。");
  const id = value.id === undefined
    ? undefined
    : assertFiniteInteger(value.id, "检查点 id", 1, Number.MAX_SAFE_INTEGER);
  const projectId = assertFiniteInteger(
    value.projectId,
    "检查点 projectId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const worldGroupId = value.worldGroupId == null
    ? null
    : assertFiniteInteger(
      value.worldGroupId,
      "检查点 worldGroupId",
      1,
      Number.MAX_SAFE_INTEGER,
    );
  const sessionId = assertFiniteInteger(
    value.sessionId,
    "检查点 sessionId",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const throughSequence = assertFiniteInteger(
    value.throughSequence,
    "检查点序号",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (typeof value.name !== "string" || !value.name.trim() || value.name !== value.name.trim()
    || value.name.length > 200) {
    throw new Error("检查点名称无效。");
  }
  const normalizedPurpose = normalizeProductRuntimeCheckpointPurposeV1({
    purpose: value.purpose,
    subjectKey: value.subjectKey,
  });
  if (value.subjectKey != null && value.subjectKey !== normalizedPurpose.subjectKey) {
    throw new Error("检查点对象不是规范字符串。");
  }
  if (typeof value.stateJson !== "string") throw new Error("检查点状态正文无效。");
  const state = parseProductRuntimeState(value.stateJson);
  if (state.lastSequence !== throughSequence) {
    throw new Error("检查点状态序号与 throughSequence 不一致。");
  }
  if (typeof value.stateHash !== "string" || !/^[a-f0-9]{64}$/.test(value.stateHash)) {
    throw new Error("检查点状态 Hash 无效。");
  }
  const createdAt = assertFiniteInteger(
    value.createdAt,
    "检查点创建时间",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  return {
    ...(id == null ? {} : { id }),
    projectId,
    worldGroupId,
    sessionId,
    throughSequence,
    name: value.name,
    ...normalizedPurpose,
    stateJson: value.stateJson,
    stateHash: value.stateHash,
    createdAt,
  };
}
