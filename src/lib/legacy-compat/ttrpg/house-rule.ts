import type { TtrpgHouseRuleOverlayV2 } from "../../types/index";

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function fail(message: string): never {
  throw new Error(`[ttrpg-house-rule] ${message}`);
}

function key(value: unknown, label: string): string {
  if (typeof value !== "string" || !KEY.test(value.trim()))
    fail(`${label} 无效`);
  return value.trim();
}

function text(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  )
    fail(`${label} 无效`);
  return value.trim().normalize("NFC");
}

export function parseTtrpgHouseRuleOverlayV2(
  value: unknown,
): TtrpgHouseRuleOverlayV2 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Overlay 必须是对象");
  const row = value as Record<string, unknown>;
  const expected = [
    "schema",
    "version",
    "overlayKey",
    "title",
    "author",
    "baseRuleSystemId",
    "baseRuleSystemVersion",
    "baseContentHash",
    "patches",
  ];
  if (
    Object.keys(row).sort().join(",") !== expected.sort().join(",") ||
    row.schema !== "storyforge.ttrpg-house-rule-overlay" ||
    row.version !== 2 ||
    typeof row.baseContentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(row.baseContentHash) ||
    !Array.isArray(row.patches) ||
    !row.patches.length ||
    row.patches.length > 100
  )
    fail("Overlay 结构无效");
  const patches = row.patches.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      fail(`patches[${index}] 无效`);
    const patch = raw as Record<string, unknown>;
    if (
      Object.keys(patch).sort().join(",") !==
        "operation,patchKey,path,reason,value" ||
      patch.operation !== "replace" ||
      !["string", "number"].includes(typeof patch.value) ||
      (typeof patch.value === "number" && !Number.isFinite(patch.value))
    )
      fail(`patches[${index}] 结构无效`);
    const path = text(patch.path, `patches[${index}].path`, 300);
    if (
      !/^(diceModels|checks|actions|conditions|turnStructure|advancement)\./.test(
        path,
      )
    )
      fail(`patches[${index}] 路径不在村规白名单`);
    return {
      patchKey: key(patch.patchKey, `patches[${index}].patchKey`),
      operation: "replace" as const,
      path,
      value: patch.value as string | number,
      reason: text(patch.reason, `patches[${index}].reason`, 2_000),
    };
  });
  if (new Set(patches.map((patch) => patch.patchKey)).size !== patches.length)
    fail("patchKey 重复");
  if (new Set(patches.map((patch) => patch.path)).size !== patches.length)
    fail("同一路径存在冲突 patch");
  return {
    schema: "storyforge.ttrpg-house-rule-overlay",
    version: 2,
    overlayKey: key(row.overlayKey, "overlayKey"),
    title: text(row.title, "title", 300),
    author: text(row.author, "author", 200),
    baseRuleSystemId: key(row.baseRuleSystemId, "baseRuleSystemId"),
    baseRuleSystemVersion: text(
      row.baseRuleSystemVersion,
      "baseRuleSystemVersion",
      100,
    ),
    baseContentHash: row.baseContentHash,
    patches,
  };
}
