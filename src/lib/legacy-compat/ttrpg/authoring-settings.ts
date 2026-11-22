import type { TtrpgProductionSeatV2 } from "../../types/index";
export type SeatDraft = Omit<TtrpgProductionSeatV2, "sourceCharacterResourceKey"> & {
  sourceCharacterResourceKey: string | null;
};

type HouseRulePatchDraft = {
  path: string;
  value: string;
  reason: string;
};

export interface TtrpgProductionWizardValueV2 {
  creationMode: "quick" | "advanced";
  instruction: string;
  background: string;
  coreConflict: string;
  difficulty: "introductory" | "standard" | "challenging";
  targetSessions: number;
  targetSessionMinutes: number;
  ruleOrigin:
    | "builtin-storyforge"
    | "builtin-rank-lite"
    | "builtin-d20-fantasy"
    | "builtin-d100-investigation"
    | "saved-rule-pack";
  savedRulePackId: number | null;
  initiativeDiceSides: number | null;
  actionsPerTurn: number | null;
  reactionsPerRound: number | null;
  deathRecoveryHeroicDiceCost: number | null;
  customHouseRulePatches: HouseRulePatchDraft[];
  gmMode: "human" | "ai" | "hybrid";
  seats: SeatDraft[];
  allowCustomSheets: boolean;
  allowAiGeneration: boolean;
  requireGmApproval: boolean;
  progressionMode: "rule-native" | "rank-lite" | "none";
  startingLevelOrTier: string;
  structure: "linear" | "branching" | "node-based" | "sandbox";
  targetSceneCount: number;
  targetQuestCount: number;
  clueRedundancy: number;
  targetEndingCount: number;
  failForward: boolean;
  freeRoam: boolean;
  characterPrivateChannels: boolean;
  gmSecrets: boolean;
  hiddenNpcState: boolean;
  hiddenDice: "never" | "gm-only" | "allowed";
  interPlayerWhispers: boolean;
  revealAuditTrail: boolean;
  linesText: string;
  veilsText: string;
  sessionZeroRequired: boolean;
  pauseSignal: string;
  openDoor: boolean;
  visualStyle: string;
  sceneImages: boolean;
  characterPortraits: boolean;
  characterExpressions: boolean;
  itemIcons: boolean;
  handouts: boolean;
  maps: boolean;
  tokens: boolean;
  generationTiming: "prebuild" | "background-during-play" | "hybrid";
  maximumGeneratedAssets: number;
  confirmAll: boolean;
}

export function createDefaultTtrpgProductionWizardValueV2(): TtrpgProductionWizardValueV2 {
  return {
    creationMode: "quick",
    instruction: "",
    background: "",
    coreConflict: "",
    difficulty: "standard",
    targetSessions: 1,
    targetSessionMinutes: 120,
    ruleOrigin: "builtin-storyforge",
    savedRulePackId: null,
    initiativeDiceSides: null,
    actionsPerTurn: null,
    reactionsPerRound: null,
    deathRecoveryHeroicDiceCost: null,
    customHouseRulePatches: [],
    gmMode: "ai",
    seats: [
      {
        seatKey: "player.1",
        label: "玩家 1",
        controller: "human",
        role: "player",
        characterMode: "world-template",
        sourceCharacterResourceKey: null,
        characterName: "",
        rankTier: null,
        privateGoal: "",
      },
      {
        seatKey: "player.2",
        label: "玩家 2",
        controller: "ai",
        role: "player",
        characterMode: "ai-generated",
        sourceCharacterResourceKey: null,
        characterName: "",
        rankTier: null,
        privateGoal: "",
      },
    ],
    allowCustomSheets: true,
    allowAiGeneration: true,
    requireGmApproval: true,
    progressionMode: "rule-native",
    startingLevelOrTier: "规则默认",
    structure: "node-based",
    targetSceneCount: 6,
    targetQuestCount: 2,
    clueRedundancy: 3,
    targetEndingCount: 3,
    failForward: true,
    freeRoam: false,
    characterPrivateChannels: true,
    gmSecrets: true,
    hiddenNpcState: true,
    hiddenDice: "gm-only",
    interPlayerWhispers: true,
    revealAuditTrail: true,
    linesText: "不生成未授权的露骨或仇恨内容",
    veilsText: "",
    sessionZeroRequired: true,
    pauseSignal: "暂停",
    openDoor: true,
    visualStyle: "延续冻结世界的视觉语言，保持角色、场景与物品一致。",
    sceneImages: true,
    characterPortraits: true,
    characterExpressions: true,
    itemIcons: true,
    handouts: true,
    maps: true,
    tokens: true,
    generationTiming: "hybrid",
    maximumGeneratedAssets: 32,
    confirmAll: false,
  };
}
