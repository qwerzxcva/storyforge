import type { TextOpenWorldParsedModulesV1, TextOpenWorldRuntimePackageV1 } from '../../types/index';
import { parseTextOpenWorldModulesV1 } from './modules';

const KEY = /^[a-z][a-z0-9._:-]{0,199}$/

function fail(message: string): never { throw new Error(`[text-open-world-combat-definitions] ${message}`) }
function stableKey(value: unknown, label: string): string {
  if (typeof value !== 'string' || !KEY.test(value)) fail(`${label}无效`)
  return value
}

/** Query-only catalog over the immutable Enemy/Encounter definitions in a ProductRelease. */
export function createTextOpenWorldCombatDefinitionCatalogV1(
  value: TextOpenWorldRuntimePackageV1 | string | unknown,
  parsedModules?: TextOpenWorldParsedModulesV1,
) {
  const modules = parsedModules ?? parseTextOpenWorldModulesV1(value)
  const enemyByKey = new Map(modules.combat.enemies.map(enemy => [enemy.key, enemy]))
  const encounterByKey = new Map(modules.combat.encounters.map(encounter => [encounter.key, encounter]))

  return {
    rules: () => structuredClone(modules.combat.rules),
    listDifficulties: () => structuredClone(modules.combat.difficultyProfiles),
    listStrategies: () => structuredClone(modules.combat.strategyProfiles),
    listEnemies: () => structuredClone(modules.combat.enemies),
    getEnemy: (enemyKey: string) => structuredClone(enemyByKey.get(stableKey(enemyKey, 'enemyKey')) ?? null),
    listEncounters: () => structuredClone(modules.combat.encounters),
    getEncounter: (encounterKey: string) => structuredClone(encounterByKey.get(stableKey(encounterKey, 'encounterKey')) ?? null),
  }
}
