
import { db } from "../../db/schema";
import type { TtrpgSessionParticipantRecordV2 } from "../../types/index";

function fail(message: string): never {
  throw new Error(`[ttrpg-participants] ${message}`);
}
function stableKey(value: string, label: string): string {
  const parsed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(parsed)) fail(`${label}无效`);
  return parsed;
}

function assertParticipant(
  row: TtrpgSessionParticipantRecordV2,
): TtrpgSessionParticipantRecordV2 {
  stableKey(row.seatKey, "seatKey");
  stableKey(row.viewerKey, "viewerKey");
  if (
    !Number.isInteger(row.projectId) ||
    row.projectId < 1 ||
    !Number.isInteger(row.worldId) ||
    row.worldId < 1 ||
    !Number.isInteger(row.workId) ||
    row.workId < 1 ||
    !Number.isInteger(row.sessionId) ||
    row.sessionId < 1 ||
    !["gm", "player", "spectator"].includes(row.role) ||
    !["human", "ai", "hybrid", "vacant"].includes(row.controller) ||
    !["assigned", "claimed", "vacant", "left"].includes(row.assignmentState) ||
    !["manual", "initiative", "natural", "pooled"].includes(row.activation) ||
    !["never", "with-owner-consent", "automatic-after-timeout"].includes(
      row.substitutionPolicy,
    ) ||
    !Number.isInteger(row.revision) ||
    row.revision < 1 ||
    !row.lastCommandId.trim() ||
    !row.lastCommandFingerprint
  ) {
    fail(`席位记录无效:${row.seatKey}`);
  }
  if (
    (row.role === "player") !== (row.actorKey != null) ||
    (row.controller === "vacant") !== (row.assignmentState === "vacant") ||
    (row.controller === "ai" && row.humanAssignmentPolicy != null) ||
    (row.controller !== "ai" &&
      row.controller !== "vacant" &&
      row.humanAssignmentPolicy == null) ||
    (row.substitutionPolicy !== "never" &&
      !row.consent.aiSubstitutionAllowed) ||
    ((row.controller === "ai" || row.controller === "hybrid") && !row.aiProfile)
  ) {
    fail(`席位控制权或同意策略不一致:${row.seatKey}`);
  }
  if (row.actorKey) stableKey(row.actorKey, "actorKey");
  if (
    row.aiProfile &&
    (row.aiProfile.latencyBudgetMs < 250 ||
      row.aiProfile.latencyBudgetMs > 120_000 ||
      row.aiProfile.costBudgetPerSessionUsd < 0 ||
      row.aiProfile.costBudgetPerSessionUsd > 10_000)
  ) {
    fail(`AI 席位预算无效:${row.seatKey}`);
  }
  return structuredClone(row);
}

export async function readTtrpgSessionParticipantsV2(
  sessionId: number,
): Promise<TtrpgSessionParticipantRecordV2[]> {
  if (!Number.isInteger(sessionId) || sessionId < 1) fail("sessionId 无效");
  const session = await db.productRuntimeSessions.get(sessionId);
  if (!session || session.kind !== "ttrpg") fail("TTRPG Instance 不存在");
  const rows = (
    await db.ttrpgSessionParticipants
      .where("sessionId")
      .equals(sessionId)
      .sortBy("seatKey")
  ).map(assertParticipant);
  if (!rows.length) fail("TTRPG Instance 缺少正式席位记录");
  if (
    rows.some(
      (row) =>
        row.projectId !== session.projectId ||
        row.worldId !== session.worldId ||
        row.workId !== session.workId,
    )
  ) {
    fail("席位记录与 Instance scope 不一致");
  }
  return rows;
}
