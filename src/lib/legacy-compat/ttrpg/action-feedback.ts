import type { TtrpgRuntimeActionObserverV2, TtrpgRuntimeActionReceiptV2, TtrpgRuntimeGmSynthesisFrameV2, TtrpgRuntimeReactionCandidateV2, TtrpgRuntimeRuleActionResultV1 } from "../../types/index";

function fail(message: string): never {
  throw new Error(`[ttrpg-action-feedback] ${message}`);
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label}必须是对象`);
  return value as Record<string, unknown>;
}
function exact(
  row: Record<string, unknown>,
  fields: readonly string[],
  label: string,
): void {
  if (
    Object.keys(row).length !== fields.length ||
    Object.keys(row).some((key) => !fields.includes(key))
  ) {
    fail(`${label}字段不在允许闭集`);
  }
}
function text(value: unknown, label: string, maximum = 4_000): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  )
    fail(`${label}无效`);
  return value.trim().normalize("NFC");
}
function key(value: unknown, label: string): string {
  const parsed = text(value, label, 200);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(parsed))
    fail(`${label}不是稳定 key`);
  return parsed;
}
function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum)
    fail(`${label}无效`);
  return Number(value);
}
function finite(value: unknown, label: string): number {
  if (!Number.isFinite(value)) fail(`${label}无效`);
  return Number(value);
}
function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    fail(`${label}无效`);
  return value as T;
}
function keyArray(value: unknown, label: string, maximum = 256): string[] {
  if (!Array.isArray(value) || value.length > maximum)
    fail(`${label}必须是有界数组`);
  const parsed = value.map((item, index) => key(item, `${label}[${index}]`));
  if (new Set(parsed).size !== parsed.length) fail(`${label}不得重复`);
  return parsed;
}
function textArray(value: unknown, label: string, maximum = 64): string[] {
  if (!Array.isArray(value) || value.length > maximum)
    fail(`${label}必须是有界数组`);
  return value.map((item, index) => text(item, `${label}[${index}]`, 1_000));
}

/** Reject explicit prose claims that invert the already committed degree. */
export function assertTtrpgFeedbackOutcomeConsistentV2(
  feedback: string,
  outcome: TtrpgRuntimeRuleActionResultV1["outcome"],
): void {
  const normalized = feedback.normalize("NFC").toLocaleLowerCase();
  const claimsFailure =
    /(?:检定|行动|尝试|结果).{0,6}(?:失败|未成功)|未能(?:完成|做到|成功)|(?:check|action|attempt)\s+(?:failed|did not succeed)/iu.test(
      normalized,
    );
  const claimsSuccess =
    /(?:检定|行动|尝试|结果).{0,6}(?:成功|顺利完成)|成功(?:完成|做到|通过)|(?:check|action|attempt)\s+succeeded/iu.test(
      normalized,
    );
  const erasesPartialCost =
    /(?:顺利|完全|彻底)(?:成功|完成)|毫无(?:代价|损失|波折)|没有(?:任何)?(?:代价|损失|波折)|(?:fully|completely)\s+succeeded|without\s+(?:cost|complication)/iu.test(
      normalized,
    );
  if (
    [
      "partial-success",
      "success",
      "hard-success",
      "extreme-success",
      "critical-success",
    ].includes(outcome) &&
    claimsFailure
  ) {
    fail("反馈与已提交的成功结果矛盾");
  }
  if (
    (outcome === "failure" || outcome === "critical-failure") &&
    claimsSuccess
  ) {
    fail("反馈与已提交的失败结果矛盾");
  }
  if (outcome === "partial-success" && erasesPartialCost) {
    fail("反馈把部分成功错误描述成无代价的完整成功，结果矛盾");
  }
}

function parseObserver(
  value: unknown,
  label: string,
): TtrpgRuntimeActionObserverV2 {
  const row = object(value, label);
  exact(
    row,
    [
      "actorKey",
      "role",
      "controller",
      "relation",
      "relevance",
      "present",
      "responsePolicy",
      "reasons",
    ],
    label,
  );
  if (row.present !== true) fail(`${label}.present 必须为 true`);
  return {
    actorKey: key(row.actorKey, `${label}.actorKey`),
    role: enumValue(row.role, ["player", "npc"] as const, `${label}.role`),
    controller: enumValue(
      row.controller,
      ["human", "ai", "hybrid", "vacant", "gm"] as const,
      `${label}.controller`,
    ),
    relation: enumValue(
      row.relation,
      ["actor", "target", "direct-effect", "scene-witness"] as const,
      `${label}.relation`,
    ),
    relevance: enumValue(
      row.relevance,
      ["primary", "relevant", "ambient"] as const,
      `${label}.relevance`,
    ),
    present: true,
    responsePolicy: enumValue(
      row.responsePolicy,
      [
        "actor-owned",
        "prompt-human",
        "ai-eligible",
        "gm-eligible",
        "observe-only",
      ] as const,
      `${label}.responsePolicy`,
    ),
    reasons: textArray(row.reasons, `${label}.reasons`, 16),
  };
}

function parseReactionWindow(value: unknown, label: string) {
  const row = object(value, label);
  exact(
    row,
    [
      "layer",
      "status",
      "eligibleActorKeys",
      "humanConfirmationRequiredActorKeys",
      "reason",
    ],
    label,
  );
  const eligibleActorKeys = keyArray(
    row.eligibleActorKeys,
    `${label}.eligibleActorKeys`,
  );
  const humanConfirmationRequiredActorKeys = keyArray(
    row.humanConfirmationRequiredActorKeys,
    `${label}.humanConfirmationRequiredActorKeys`,
  );
  if (
    humanConfirmationRequiredActorKeys.some(
      (actorKey) => !eligibleActorKeys.includes(actorKey),
    )
  ) {
    fail(`${label}真人确认角色必须属于可响应角色`);
  }
  return {
    layer: enumValue(
      row.layer,
      [
        "mechanical-reaction",
        "immediate-character",
        "scene-consequence",
        "campaign-consequence",
      ] as const,
      `${label}.layer`,
    ),
    status: enumValue(
      row.status,
      ["open", "advisory", "closed"] as const,
      `${label}.status`,
    ),
    eligibleActorKeys,
    humanConfirmationRequiredActorKeys,
    reason: text(row.reason, `${label}.reason`, 2_000),
  };
}

function parseReactionCandidate(
  value: unknown,
  label: string,
): TtrpgRuntimeReactionCandidateV2 {
  const row = object(value, label);
  exact(
    row,
    [
      "actorKey",
      "responsePolicy",
      "visibleFacts",
      "motivation",
      "reactionType",
      "proposedActionKey",
      "targetKey",
      "rulePrerequisites",
      "publicReactionText",
      "visibility",
      "reasonIfNoReaction",
    ],
    label,
  );
  const responsePolicy = enumValue(
    row.responsePolicy,
    [
      "actor-owned",
      "prompt-human",
      "ai-eligible",
      "gm-eligible",
      "observe-only",
    ] as const,
    `${label}.responsePolicy`,
  );
  const publicReactionText =
    row.publicReactionText == null
      ? null
      : text(row.publicReactionText, `${label}.publicReactionText`, 4_000);
  if (responsePolicy === "prompt-human" && publicReactionText != null)
    fail(`${label}不得代演真人角色`);
  if (
    (responsePolicy === "ai-eligible" || responsePolicy === "gm-eligible") &&
    publicReactionText == null
  )
    fail(`${label}自动/主持角色缺少可观察反应候选`);
  return {
    actorKey: key(row.actorKey, `${label}.actorKey`),
    responsePolicy,
    visibleFacts: textArray(row.visibleFacts, `${label}.visibleFacts`, 16),
    motivation: text(row.motivation, `${label}.motivation`, 4_000),
    reactionType: enumValue(
      row.reactionType,
      [
        "conceal-or-block",
        "assist",
        "withdraw",
        "observe",
        "prompt-human",
      ] as const,
      `${label}.reactionType`,
    ),
    proposedActionKey:
      row.proposedActionKey == null
        ? null
        : key(row.proposedActionKey, `${label}.proposedActionKey`),
    targetKey:
      row.targetKey == null ? null : key(row.targetKey, `${label}.targetKey`),
    rulePrerequisites: textArray(
      row.rulePrerequisites,
      `${label}.rulePrerequisites`,
      16,
    ),
    publicReactionText,
    visibility: enumValue(
      row.visibility,
      ["public", "player-private", "gm-only"] as const,
      `${label}.visibility`,
    ),
    reasonIfNoReaction:
      row.reasonIfNoReaction == null
        ? null
        : text(row.reasonIfNoReaction, `${label}.reasonIfNoReaction`, 2_000),
  };
}

export function parseTtrpgActionReceiptV2(
  value: unknown,
): TtrpgRuntimeActionReceiptV2 {
  const row = object(value, "ActionReceipt");
  exact(
    row,
    [
      "schema",
      "version",
      "receiptKey",
      "actionSequence",
      "terminalStatus",
      "context",
      "mechanicalSummary",
      "actorConsequence",
      "sceneConsequence",
      "worldConsequence",
      "failForwardAvailable",
      "changedEntityKeys",
      "suggestedNextActionKeys",
      "nextActorKey",
      "nextRound",
    ],
    "ActionReceipt",
  );
  if (
    row.schema !== "storyforge.ttrpg-action-receipt" ||
    row.version !== 2 ||
    !["resolved-no-roll", "resolved-check"].includes(
      String(row.terminalStatus),
    )
  ) {
    fail("ActionReceipt schema/version/terminalStatus 无效");
  }
  const actionSequence = integer(
    row.actionSequence,
    "ActionReceipt.actionSequence",
    1,
  );
  const contextRow = object(row.context, "ActionContext");
  const contextFields = [
    "schema",
    "version",
    "sceneKey",
    "sceneSnapshot",
    "round",
    "activeActorKey",
    "actorKey",
    "actorController",
    "targetKey",
    "actionKey",
    "actionPhase",
    "declaredIntent",
    "checkSnapshot",
    "criticality",
    "criticalityReasons",
    "actorConditionKeys",
    "actorInventoryInstanceIds",
    "grantingItemInstanceIds",
    "abilityStateKey",
    "abilityUsesBefore",
    "abilityCooldownBefore",
    "activeQuestKeys",
    "discoveredConclusionKeys",
    "observers",
    "reactionWindows",
    "reactionCandidates",
  ];
  exact(
    contextRow,
    contextFields,
    "ActionContext",
  );
  if (
    contextRow.schema !== "storyforge.ttrpg-action-context" ||
    contextRow.version !== 2
  )
    fail("ActionContext schema/version 无效");
  if (
    !Array.isArray(contextRow.observers) ||
    !Array.isArray(contextRow.reactionWindows)
  )
    fail("ActionContext 观察者/反应窗口无效");
  const observers = contextRow.observers.map((item, index) =>
    parseObserver(item, `ActionContext.observers[${index}]`),
  );
  const reactionWindows = contextRow.reactionWindows.map((item, index) =>
    parseReactionWindow(item, `ActionContext.reactionWindows[${index}]`),
  );
  if (!Array.isArray(contextRow.reactionCandidates))
    fail("ActionContext 反应候选必须是数组");
  const reactionCandidates = contextRow.reactionCandidates.map((item, index) =>
    parseReactionCandidate(item, `ActionContext.reactionCandidates[${index}]`),
  );
  if (
    reactionWindows.length !== 4 ||
    new Set(reactionWindows.map((item) => item.layer)).size !== 4
  )
    fail("ActionContext 必须包含四层唯一反应窗口");
  const actorKey = key(contextRow.actorKey, "ActionContext.actorKey");
  if (
    !observers.some(
      (observer) =>
        observer.actorKey === actorKey && observer.relation === "actor",
    )
  )
    fail("ActionContext 缺少行动者观察记录");
  {
    const relevantObservers = new Map(
      observers
        .filter(
          (observer) =>
            observer.actorKey !== actorKey && observer.relevance !== "ambient",
        )
        .map((observer) => [observer.actorKey, observer]),
    );
    if (
      reactionCandidates.length !== relevantObservers.size ||
      new Set(reactionCandidates.map((candidate) => candidate.actorKey)).size !==
        reactionCandidates.length ||
      reactionCandidates.some(
        (candidate) =>
          relevantObservers.get(candidate.actorKey)?.responsePolicy !==
          candidate.responsePolicy,
      )
    ) {
      fail("ActionContext 反应候选必须恰好覆盖全部相关在场观察者且保持权限");
    }
  }
  const abilityUsesBefore =
    contextRow.abilityUsesBefore == null
      ? null
      : integer(
          contextRow.abilityUsesBefore,
          "ActionContext.abilityUsesBefore",
        );
  const targetKey =
    contextRow.targetKey == null
      ? null
      : key(contextRow.targetKey, "ActionContext.targetKey");
  const nextActorKey =
    row.nextActorKey == null
      ? null
      : key(row.nextActorKey, "ActionReceipt.nextActorKey");
  const declaredIntent =
    contextRow.declaredIntent == null
      ? null
      : (() => {
          const intent = object(
            contextRow.declaredIntent,
            "ActionContext.declaredIntent",
          );
          exact(
            intent,
            ["intentKey", "rawInput", "goal", "method"],
            "ActionContext.declaredIntent",
          );
          return {
            intentKey: key(
              intent.intentKey,
              "ActionContext.declaredIntent.intentKey",
            ),
            rawInput: text(
              intent.rawInput,
              "ActionContext.declaredIntent.rawInput",
              10_000,
            ),
            goal:
              intent.goal == null
                ? null
                : text(intent.goal, "ActionContext.declaredIntent.goal", 2_000),
            method:
              intent.method == null
                ? null
                : text(
                    intent.method,
                    "ActionContext.declaredIntent.method",
                    2_000,
                  ),
          };
        })();
  if (contextRow.sceneSnapshot == null) fail("ActionContext 缺少场景快照");
  const sceneSnapshot = (() => {
        const snapshot = object(contextRow.sceneSnapshot, "ActionContext.sceneSnapshot");
        exact(
          snapshot,
          ["title", "description", "locationKey", "failureForward", "gmSecret"],
          "ActionContext.sceneSnapshot",
        );
        return {
          title: text(snapshot.title, "ActionContext.sceneSnapshot.title", 300),
          description: text(snapshot.description, "ActionContext.sceneSnapshot.description", 20_000),
          locationKey:
            snapshot.locationKey == null
              ? null
              : key(snapshot.locationKey, "ActionContext.sceneSnapshot.locationKey"),
          failureForward: text(snapshot.failureForward, "ActionContext.sceneSnapshot.failureForward", 20_000),
          gmSecret: text(snapshot.gmSecret, "ActionContext.sceneSnapshot.gmSecret", 20_000),
        };
      })();
  const checkSnapshot = contextRow.checkSnapshot == null
    ? null
    : (() => {
        const snapshot = object(contextRow.checkSnapshot, "ActionContext.checkSnapshot");
        exact(
          snapshot,
          [
            "checkKey",
            "attributeKey",
            "attributeValue",
            "skillKey",
            "skillValue",
            "diceModelKey",
            "difficulty",
          ],
          "ActionContext.checkSnapshot",
        );
        const skillKey =
          snapshot.skillKey == null
            ? null
            : key(snapshot.skillKey, "ActionContext.checkSnapshot.skillKey");
        const skillValue =
          snapshot.skillValue == null
            ? null
            : finite(
                snapshot.skillValue,
                "ActionContext.checkSnapshot.skillValue",
              );
        if ((skillKey == null) !== (skillValue == null))
          fail("ActionContext.checkSnapshot 技能字段必须成对出现");
        return {
          checkKey: key(snapshot.checkKey, "ActionContext.checkSnapshot.checkKey"),
          attributeKey: key(snapshot.attributeKey, "ActionContext.checkSnapshot.attributeKey"),
          attributeValue: finite(snapshot.attributeValue, "ActionContext.checkSnapshot.attributeValue"),
          skillKey,
          skillValue,
          diceModelKey: key(snapshot.diceModelKey, "ActionContext.checkSnapshot.diceModelKey"),
          difficulty: integer(snapshot.difficulty, "ActionContext.checkSnapshot.difficulty", 0),
        };
      })();
  if (
    row.receiptKey !== `action-receipt.${actionSequence}` ||
    typeof row.failForwardAvailable !== "boolean"
  )
    fail("ActionReceipt 身份或失败前进字段无效");
  return {
    schema: "storyforge.ttrpg-action-receipt",
    version: 2,
    receiptKey: String(row.receiptKey),
    actionSequence,
    terminalStatus: row.terminalStatus as TtrpgRuntimeActionReceiptV2["terminalStatus"],
    context: {
      schema: "storyforge.ttrpg-action-context",
      version: 2,
      sceneKey: key(contextRow.sceneKey, "ActionContext.sceneKey"),
      sceneSnapshot,
      round: integer(contextRow.round, "ActionContext.round", 1),
      activeActorKey: key(
        contextRow.activeActorKey,
        "ActionContext.activeActorKey",
      ),
      actorKey,
      actorController: enumValue(
        contextRow.actorController,
        ["human", "ai", "hybrid", "vacant", "gm"] as const,
        "ActionContext.actorController",
      ),
      targetKey,
      actionKey: key(contextRow.actionKey, "ActionContext.actionKey"),
      actionPhase: enumValue(
        contextRow.actionPhase,
        ["free", "action", "reaction", "downtime"] as const,
        "ActionContext.actionPhase",
      ),
      declaredIntent,
      checkSnapshot,
      criticality: enumValue(
        contextRow.criticality,
        ["routine", "meaningful", "critical"] as const,
        "ActionContext.criticality",
      ),
      criticalityReasons: textArray(
        contextRow.criticalityReasons,
        "ActionContext.criticalityReasons",
        32,
      ),
      actorConditionKeys: keyArray(
        contextRow.actorConditionKeys,
        "ActionContext.actorConditionKeys",
      ),
      actorInventoryInstanceIds: keyArray(
        contextRow.actorInventoryInstanceIds,
        "ActionContext.actorInventoryInstanceIds",
      ),
      grantingItemInstanceIds: keyArray(
        contextRow.grantingItemInstanceIds,
        "ActionContext.grantingItemInstanceIds",
      ),
      abilityStateKey: key(
        contextRow.abilityStateKey,
        "ActionContext.abilityStateKey",
      ),
      abilityUsesBefore,
      abilityCooldownBefore: integer(
        contextRow.abilityCooldownBefore,
        "ActionContext.abilityCooldownBefore",
      ),
      activeQuestKeys: keyArray(
        contextRow.activeQuestKeys,
        "ActionContext.activeQuestKeys",
      ),
      discoveredConclusionKeys: keyArray(
        contextRow.discoveredConclusionKeys,
        "ActionContext.discoveredConclusionKeys",
      ),
      observers,
      reactionWindows,
      reactionCandidates,
    },
    mechanicalSummary: text(
      row.mechanicalSummary,
      "ActionReceipt.mechanicalSummary",
    ),
    actorConsequence: text(
      row.actorConsequence,
      "ActionReceipt.actorConsequence",
    ),
    sceneConsequence: text(
      row.sceneConsequence,
      "ActionReceipt.sceneConsequence",
    ),
    worldConsequence: text(
      row.worldConsequence,
      "ActionReceipt.worldConsequence",
    ),
    failForwardAvailable: row.failForwardAvailable,
    changedEntityKeys: keyArray(
      row.changedEntityKeys,
      "ActionReceipt.changedEntityKeys",
    ),
    suggestedNextActionKeys: keyArray(
      row.suggestedNextActionKeys,
      "ActionReceipt.suggestedNextActionKeys",
    ),
    nextActorKey,
    nextRound: integer(row.nextRound, "ActionReceipt.nextRound", 1),
  };
}

export function parseTtrpgGmSynthesisFrameV2(
  value: unknown,
  receipt: TtrpgRuntimeActionReceiptV2,
): TtrpgRuntimeGmSynthesisFrameV2 {
  const row = object(value, "GmSynthesisFrame");
  exact(
    row,
    [
      "schema",
      "version",
      "actionSequence",
      "mechanicalOutcome",
      "actorFeedback",
      "reactions",
      "sceneUpdate",
      "worldUpdate",
      "nextPrompts",
    ],
    "GmSynthesisFrame",
  );
  if (
    row.schema !== "storyforge.ttrpg-gm-synthesis-frame" ||
    row.version !== 2 ||
    row.actionSequence !== receipt.actionSequence ||
    !Array.isArray(row.reactions)
  ) {
    fail("GmSynthesisFrame schema/version/行动绑定无效");
  }
  const allowed = new Map(
    receipt.context.observers
      .filter(
        (observer) =>
          observer.actorKey !== receipt.context.actorKey &&
          observer.relevance !== "ambient",
      )
      .map((observer) => [observer.actorKey, observer]),
  );
  const reactions = row.reactions.map((value, index) => {
    const reaction = object(value, `GmSynthesisFrame.reactions[${index}]`);
    exact(
      reaction,
      ["actorKey", "responsePolicy", "text"],
      `GmSynthesisFrame.reactions[${index}]`,
    );
    const actorKey = key(
      reaction.actorKey,
      `GmSynthesisFrame.reactions[${index}].actorKey`,
    );
    const observer =
      allowed.get(actorKey) ??
      fail(`GmSynthesisFrame 包含不在场或不相关角色:${actorKey}`);
    const policy = enumValue(
      reaction.responsePolicy,
      [
        "actor-owned",
        "prompt-human",
        "ai-eligible",
        "gm-eligible",
        "observe-only",
      ] as const,
      `GmSynthesisFrame.reactions[${index}].responsePolicy`,
    );
    if (policy !== observer.responsePolicy)
      fail(`GmSynthesisFrame 试图改变角色响应权限:${actorKey}`);
    const reactionText =
      reaction.text == null
        ? null
        : text(
            reaction.text,
            `GmSynthesisFrame.reactions[${index}].text`,
            4_000,
          );
    if (policy === "prompt-human" && reactionText != null)
      fail(`AI 不得代演真人角色:${actorKey}`);
    if (
      (policy === "ai-eligible" || policy === "gm-eligible") &&
      reactionText == null
    )
      fail(`自动/主持角色缺少结构化反应:${actorKey}`);
    return { actorKey, responsePolicy: policy, text: reactionText };
  });
  if (
    new Set(reactions.map((reaction) => reaction.actorKey)).size !==
      reactions.length ||
    reactions.length !== allowed.size ||
    reactions.some((reaction) => !allowed.has(reaction.actorKey))
  ) {
    fail("GmSynthesisFrame 必须恰好覆盖全部相关在场观察者");
  }
  return {
    schema: "storyforge.ttrpg-gm-synthesis-frame",
    version: 2,
    actionSequence: receipt.actionSequence,
    mechanicalOutcome: text(
      row.mechanicalOutcome,
      "GmSynthesisFrame.mechanicalOutcome",
    ),
    actorFeedback: text(row.actorFeedback, "GmSynthesisFrame.actorFeedback"),
    reactions,
    sceneUpdate: text(row.sceneUpdate, "GmSynthesisFrame.sceneUpdate"),
    worldUpdate: text(row.worldUpdate, "GmSynthesisFrame.worldUpdate"),
    nextPrompts: textArray(row.nextPrompts, "GmSynthesisFrame.nextPrompts", 8),
  };
}
