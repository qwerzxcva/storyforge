
import { isSha256Hash } from "../product-production/hash";
import type { TtrpgHouseRuleDiffV2, TtrpgProductionBriefV2, TtrpgProductionSeatV2 } from "../../types/index";
import { parseTtrpgHouseRuleOverlayV2 } from "./house-rule";
import { parseTtrpgCampaignDesignV2 } from "./campaign-proposal";

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function fail(message: string): never {
  throw new Error(`[ttrpg-production-brief] ${message}`);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} 必须是对象`);
  return value as Record<string, unknown>;
}
function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (
    expected.length !== actual.length ||
    expected.some((key, index) => key !== actual[index])
  ) {
    fail(`${label} 字段不精确:${actual.join(",")}`);
  }
}
function text(
  value: unknown,
  label: string,
  maximum = 10_000,
  allowEmpty = false,
): string {
  if (typeof value !== "string") fail(`${label} 必须是字符串`);
  const parsed = value.trim().normalize("NFC");
  if ((!allowEmpty && !parsed) || parsed.length > maximum)
    fail(`${label} 为空或过长`);
  return parsed;
}
function key(value: unknown, label: string): string {
  const parsed = text(value, label, 200);
  if (!STABLE_KEY.test(parsed)) fail(`${label} 不是稳定 key`);
  return parsed;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(`${label} 必须是 boolean`);
  return value;
}
function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    fail(`${label} 必须是 ${minimum}～${maximum} 的整数`);
  }
  return Number(value);
}
function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    fail(`${label} 枚举无效`);
  return value as T;
}
function texts(value: unknown, label: string, maximumItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maximumItems)
    fail(`${label} 必须是有界数组`);
  const parsed = value.map((item, index) =>
    text(item, `${label}[${index}]`, 2_000),
  );
  if (new Set(parsed).size !== parsed.length) fail(`${label} 不允许重复`);
  return parsed;
}
function nullableId(value: unknown, label: string): number | null {
  return value === null
    ? null
    : integer(value, label, 1, Number.MAX_SAFE_INTEGER);
}
function nullableWorldResourceKey(value: unknown, label: string): string | null {
  if (value === null) return null;
  const resourceKey = text(value, label, 1_000);
  if (!resourceKey.startsWith("world-release:") || /\s/.test(resourceKey))
    fail(`${label} 不是中立世界资源 key`);
  return resourceKey;
}
function nullableTier(
  value: unknown,
  label: string,
): TtrpgProductionSeatV2["rankTier"] {
  return value === null
    ? null
    : enumValue<TtrpgProductionSeatV2["rankTier"] & string>(
        value,
        ["D", "C", "B", "A"],
        label,
      );
}

function parseSeat(value: unknown, index: number): TtrpgProductionSeatV2 {
  const label = `table.seats[${index}]`;
  const row = record(value, label);
  exact(
    row,
    [
      "seatKey",
      "label",
      "controller",
      "role",
      "characterMode",
      "sourceCharacterResourceKey",
      "characterName",
      "rankTier",
      "privateGoal",
    ],
    label,
  );
  const characterMode = enumValue(
    row.characterMode,
    ["world-template", "quick-card", "manual", "ai-generated"],
    `${label}.characterMode`,
  );
  const sourceCharacterResourceKey = nullableWorldResourceKey(
    row.sourceCharacterResourceKey,
    `${label}.sourceCharacterResourceKey`,
  );
  const rankTier = nullableTier(row.rankTier, `${label}.rankTier`);
  if (characterMode === "world-template" && sourceCharacterResourceKey === null)
    fail(`${label} 世界模板缺少世界资源 key`);
  if (characterMode !== "world-template" && sourceCharacterResourceKey !== null)
    fail(`${label} 非世界模板不得绑定世界资源 key`);
  if (characterMode === "quick-card" && rankTier === null)
    fail(`${label} 快速卡缺少阶位`);
  if (characterMode !== "quick-card" && rankTier !== null)
    fail(`${label} 非快速卡不得声明阶位`);
  return {
    seatKey: key(row.seatKey, `${label}.seatKey`),
    label: text(row.label, `${label}.label`, 200),
    controller: enumValue(
      row.controller,
      ["human", "ai", "open"],
      `${label}.controller`,
    ),
    role: enumValue(row.role, ["player", "assistant-gm"], `${label}.role`),
    characterMode,
    sourceCharacterResourceKey,
    characterName: text(row.characterName, `${label}.characterName`, 300, true),
    rankTier,
    privateGoal: text(row.privateGoal, `${label}.privateGoal`, 2_000, true),
  };
}

function parseHouseRuleDiff(value: unknown): TtrpgHouseRuleDiffV2[] {
  if (!Array.isArray(value) || value.length > 100)
    fail("rules.houseRuleDiff 必须是有界数组");
  return value.map((item, index) => {
    const row = record(item, `rules.houseRuleDiff[${index}]`);
    exact(
      row,
      ["patchKey", "path", "before", "after", "reason"],
      `rules.houseRuleDiff[${index}]`,
    );
    if (
      !["string", "number"].includes(typeof row.before) ||
      !["string", "number"].includes(typeof row.after) ||
      typeof row.before !== typeof row.after
    )
      fail(`rules.houseRuleDiff[${index}] 值类型无效`);
    return {
      patchKey: key(row.patchKey, `rules.houseRuleDiff[${index}].patchKey`),
      path: text(row.path, `rules.houseRuleDiff[${index}].path`, 300),
      before: row.before as string | number,
      after: row.after as string | number,
      reason: text(row.reason, `rules.houseRuleDiff[${index}].reason`, 2_000),
    };
  });
}

/** Strict closed parser used by Brief persistence, planning and production. */
export function parseTtrpgProductionBriefV2(
  value: unknown,
): TtrpgProductionBriefV2 {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      fail("内容不是合法 JSON");
    }
  }
  const row = record(candidate, "brief");
  const rootFields = [
      "schema",
      "version",
      "creationMode",
      "naturalLanguageInstruction",
      "campaign",
      "campaignDesign",
      "rules",
      "table",
      "characters",
      "story",
      "information",
      "safety",
      "media",
      "confirmations",
    ];
  exact(row, rootFields, "brief");
  if (row.schema !== "storyforge.ttrpg-production-brief" || row.version !== 2)
    fail("schema/version 无效");

  const campaign = record(row.campaign, "campaign");
  exact(
    campaign,
    [
      "title",
      "premise",
      "background",
      "coreConflict",
      "genreTags",
      "tone",
      "difficulty",
      "targetSessions",
      "targetSessionMinutes",
    ],
    "campaign",
  );
  const rules = record(row.rules, "rules");
  exact(
    rules,
    [
      "origin",
      "rulePackRecordId",
      "ruleSystemId",
      "ruleSystemVersion",
      "baseContentHash",
      "effectiveContentHash",
      "houseRuleOverlay",
      "houseRuleDiff",
    ],
    "rules",
  );
  const origin = enumValue(
    rules.origin,
    [
      "builtin-storyforge",
      "builtin-rank-lite",
      "builtin-d20-fantasy",
      "builtin-d100-investigation",
      "saved-rule-pack",
    ],
    "rules.origin",
  );
  const rulePackRecordId = nullableId(
    rules.rulePackRecordId,
    "rules.rulePackRecordId",
  );
  if ((origin === "saved-rule-pack") !== (rulePackRecordId !== null))
    fail("saved-rule-pack 与 recordId 不闭合");
  if (
    !isSha256Hash(rules.baseContentHash) ||
    !isSha256Hash(rules.effectiveContentHash)
  )
    fail("rules hash 无效");
  const houseRuleOverlay =
    rules.houseRuleOverlay === null
      ? null
      : parseTtrpgHouseRuleOverlayV2(rules.houseRuleOverlay);
  const houseRuleDiff = parseHouseRuleDiff(rules.houseRuleDiff);
  if ((houseRuleOverlay === null) !== (houseRuleDiff.length === 0))
    fail("Overlay 与 diff 不闭合");
  if (
    houseRuleOverlay &&
    (houseRuleOverlay.baseContentHash !== rules.baseContentHash ||
      houseRuleOverlay.baseRuleSystemId !== rules.ruleSystemId ||
      houseRuleOverlay.baseRuleSystemVersion !== rules.ruleSystemVersion ||
      houseRuleOverlay.patches.length !== houseRuleDiff.length ||
      houseRuleOverlay.patches.some(
        (patch, index) => patch.patchKey !== houseRuleDiff[index]?.patchKey,
      ))
  ) {
    fail("Overlay、基线规则与 diff 不闭合");
  }
  if (!houseRuleOverlay && rules.baseContentHash !== rules.effectiveContentHash)
    fail("无村规时 effective hash 必须等于 base hash");

  const table = record(row.table, "table");
  exact(
    table,
    [
      "gmMode",
      "seats",
      "spectatorPolicy",
      "joinInProgress",
      "asynchronousPlay",
    ],
    "table",
  );
  if (
    !Array.isArray(table.seats) ||
    table.seats.length < 1 ||
    table.seats.length > 12
  )
    fail("table.seats 数量必须是 1～12");
  const seats = table.seats.map(parseSeat);
  if (new Set(seats.map((seat) => seat.seatKey)).size !== seats.length)
    fail("seatKey 重复");
  const worldSeatIds = seats.flatMap((seat) =>
    seat.sourceCharacterResourceKey == null ? [] : [seat.sourceCharacterResourceKey],
  );
  if (new Set(worldSeatIds).size !== worldSeatIds.length)
    fail("同一世界角色不能同时绑定多个席位");
  if (
    !seats.some((seat) => seat.role === "player" && seat.controller !== "open")
  )
    fail("至少需要一个已分配玩家席位");

  const characters = record(row.characters, "characters");
  exact(
    characters,
    [
      "defaultCreationMode",
      "allowCustomSheets",
      "allowAiGeneration",
      "requireGmApproval",
      "progressionMode",
      "startingLevelOrTier",
      "requiredProfileFields",
    ],
    "characters",
  );
  const allowAiGeneration = bool(
    characters.allowAiGeneration,
    "characters.allowAiGeneration",
  );
  if (
    !allowAiGeneration &&
    seats.some((seat) => seat.characterMode === "ai-generated")
  )
    fail("AI 车卡被禁用但席位仍请求 AI 生成");

  const story = record(row.story, "story");
  exact(
    story,
    [
      "structure",
      "openingScene",
      "targetSceneCount",
      "targetQuestCount",
      "clueRedundancy",
      "targetEndingCount",
      "failForward",
      "freeRoam",
      "canonMutationPolicy",
    ],
    "story",
  );
  const information = record(row.information, "information");
  exact(
    information,
    [
      "characterPrivateChannels",
      "gmSecrets",
      "hiddenNpcState",
      "hiddenDice",
      "interPlayerWhispers",
      "revealAuditTrail",
    ],
    "information",
  );
  const safety = record(row.safety, "safety");
  exact(
    safety,
    [
      "sessionZeroRequired",
      "consentChecklist",
      "lines",
      "veils",
      "contentWarnings",
      "pauseSignal",
      "openDoor",
    ],
    "safety",
  );
  const media = record(row.media, "media");
  exact(
    media,
    [
      "visualStyle",
      "sceneImages",
      "characterPortraits",
      "characterExpressions",
      "itemIcons",
      "handouts",
      "maps",
      "tokens",
      "generationTiming",
      "backgroundGeneration",
      "textFallback",
      "maximumGeneratedAssets",
    ],
    "media",
  );
  const generationTiming = enumValue(
    media.generationTiming,
    ["prebuild", "background-during-play", "hybrid"],
    "media.generationTiming",
  );
  const backgroundGeneration = bool(
    media.backgroundGeneration,
    "media.backgroundGeneration",
  );
  if (backgroundGeneration !== (generationTiming !== "prebuild"))
    fail("后台生成开关与 generationTiming 不一致");
  const mediaEnabled = [
    "sceneImages",
    "characterPortraits",
    "characterExpressions",
    "itemIcons",
    "handouts",
    "maps",
    "tokens",
  ].some((field) => media[field] === true);
  const maximumGeneratedAssets = integer(
    media.maximumGeneratedAssets,
    "media.maximumGeneratedAssets",
    0,
    10_000,
  );
  if (mediaEnabled !== maximumGeneratedAssets > 0)
    fail("媒资目标与最大生成数量不闭合");

  const confirmations = record(row.confirmations, "confirmations");
  exact(
    confirmations,
    [
      "worldCanonBoundary",
      "numericMappings",
      "ruleLicense",
      "aiParticipationDisclosure",
      "mediaRights",
    ],
    "confirmations",
  );
  const campaignDesign = parseTtrpgCampaignDesignV2(row.campaignDesign);
  return {
    schema: "storyforge.ttrpg-production-brief",
    version: 2,
    creationMode: enumValue(
      row.creationMode,
      ["quick", "advanced"],
      "creationMode",
    ),
    naturalLanguageInstruction: text(
      row.naturalLanguageInstruction,
      "naturalLanguageInstruction",
      20_000,
    ),
    campaign: {
      title: text(campaign.title, "campaign.title", 300),
      premise: text(campaign.premise, "campaign.premise", 5_000),
      background: text(campaign.background, "campaign.background", 10_000),
      coreConflict: text(campaign.coreConflict, "campaign.coreConflict", 5_000),
      genreTags: texts(campaign.genreTags, "campaign.genreTags", 30),
      tone: texts(campaign.tone, "campaign.tone", 30),
      difficulty: enumValue(
        campaign.difficulty,
        ["introductory", "standard", "challenging"],
        "campaign.difficulty",
      ),
      targetSessions: integer(
        campaign.targetSessions,
        "campaign.targetSessions",
        1,
        100,
      ),
      targetSessionMinutes: integer(
        campaign.targetSessionMinutes,
        "campaign.targetSessionMinutes",
        15,
        720,
      ),
    },
    campaignDesign,
    rules: {
      origin,
      rulePackRecordId,
      ruleSystemId: key(rules.ruleSystemId, "rules.ruleSystemId"),
      ruleSystemVersion: text(
        rules.ruleSystemVersion,
        "rules.ruleSystemVersion",
        100,
      ),
      baseContentHash: rules.baseContentHash as string,
      effectiveContentHash: rules.effectiveContentHash as string,
      houseRuleOverlay,
      houseRuleDiff,
    },
    table: {
      gmMode: enumValue(
        table.gmMode,
        ["human", "ai", "hybrid"],
        "table.gmMode",
      ),
      seats,
      spectatorPolicy: enumValue(
        table.spectatorPolicy,
        ["disabled", "public-only", "invited"],
        "table.spectatorPolicy",
      ),
      joinInProgress: bool(table.joinInProgress, "table.joinInProgress"),
      asynchronousPlay: bool(table.asynchronousPlay, "table.asynchronousPlay"),
    },
    characters: {
      defaultCreationMode: enumValue(
        characters.defaultCreationMode,
        ["world-template", "quick-card", "manual", "ai-generated"],
        "characters.defaultCreationMode",
      ),
      allowCustomSheets: bool(
        characters.allowCustomSheets,
        "characters.allowCustomSheets",
      ),
      allowAiGeneration,
      requireGmApproval: bool(
        characters.requireGmApproval,
        "characters.requireGmApproval",
      ),
      progressionMode: enumValue(
        characters.progressionMode,
        ["rule-native", "rank-lite", "none"],
        "characters.progressionMode",
      ),
      startingLevelOrTier: text(
        characters.startingLevelOrTier,
        "characters.startingLevelOrTier",
        100,
      ),
      requiredProfileFields: texts(
        characters.requiredProfileFields,
        "characters.requiredProfileFields",
        100,
      ),
    },
    story: {
      structure: enumValue(
        story.structure,
        ["linear", "branching", "node-based", "sandbox"],
        "story.structure",
      ),
      openingScene: text(story.openingScene, "story.openingScene", 5_000),
      targetSceneCount: integer(
        story.targetSceneCount,
        "story.targetSceneCount",
        1,
        1_000,
      ),
      targetQuestCount: integer(
        story.targetQuestCount,
        "story.targetQuestCount",
        1,
        100,
      ),
      clueRedundancy: integer(
        story.clueRedundancy,
        "story.clueRedundancy",
        1,
        10,
      ),
      targetEndingCount: integer(
        story.targetEndingCount,
        "story.targetEndingCount",
        1,
        100,
      ),
      failForward: bool(story.failForward, "story.failForward"),
      freeRoam: bool(story.freeRoam, "story.freeRoam"),
      canonMutationPolicy: enumValue(
        story.canonMutationPolicy,
        ["session-only", "author-review", "allow-world-candidates"],
        "story.canonMutationPolicy",
      ),
    },
    information: {
      characterPrivateChannels: bool(
        information.characterPrivateChannels,
        "information.characterPrivateChannels",
      ),
      gmSecrets: bool(information.gmSecrets, "information.gmSecrets"),
      hiddenNpcState: bool(
        information.hiddenNpcState,
        "information.hiddenNpcState",
      ),
      hiddenDice: enumValue(
        information.hiddenDice,
        ["never", "gm-only", "allowed"],
        "information.hiddenDice",
      ),
      interPlayerWhispers: bool(
        information.interPlayerWhispers,
        "information.interPlayerWhispers",
      ),
      revealAuditTrail: bool(
        information.revealAuditTrail,
        "information.revealAuditTrail",
      ),
    },
    safety: {
      sessionZeroRequired: bool(
        safety.sessionZeroRequired,
        "safety.sessionZeroRequired",
      ),
      consentChecklist: texts(
        safety.consentChecklist,
        "safety.consentChecklist",
        100,
      ),
      lines: texts(safety.lines, "safety.lines", 100),
      veils: texts(safety.veils, "safety.veils", 100),
      contentWarnings: texts(
        safety.contentWarnings,
        "safety.contentWarnings",
        100,
      ),
      pauseSignal: text(safety.pauseSignal, "safety.pauseSignal", 100),
      openDoor: bool(safety.openDoor, "safety.openDoor"),
    },
    media: {
      visualStyle: text(media.visualStyle, "media.visualStyle", 1_000),
      sceneImages: bool(media.sceneImages, "media.sceneImages"),
      characterPortraits: bool(
        media.characterPortraits,
        "media.characterPortraits",
      ),
      characterExpressions: bool(
        media.characterExpressions,
        "media.characterExpressions",
      ),
      itemIcons: bool(media.itemIcons, "media.itemIcons"),
      handouts: bool(media.handouts, "media.handouts"),
      maps: bool(media.maps, "media.maps"),
      tokens: bool(media.tokens, "media.tokens"),
      generationTiming,
      backgroundGeneration,
      textFallback: bool(media.textFallback, "media.textFallback"),
      maximumGeneratedAssets,
    },
    confirmations: {
      worldCanonBoundary: bool(
        confirmations.worldCanonBoundary,
        "confirmations.worldCanonBoundary",
      ),
      numericMappings: bool(
        confirmations.numericMappings,
        "confirmations.numericMappings",
      ),
      ruleLicense: bool(confirmations.ruleLicense, "confirmations.ruleLicense"),
      aiParticipationDisclosure: bool(
        confirmations.aiParticipationDisclosure,
        "confirmations.aiParticipationDisclosure",
      ),
      mediaRights: bool(confirmations.mediaRights, "confirmations.mediaRights"),
    },
  };
}
