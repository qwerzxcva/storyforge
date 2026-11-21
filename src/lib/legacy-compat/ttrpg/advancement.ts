import type { TtrpgRuntimeState } from '../../types/index';

type Product = NonNullable<TtrpgRuntimeState['product']>

/** Milestones award every active PC; actor-targeted XP/currency effects adjust that PC. */
export function earnedTtrpgCharacterCurrencyV2(product: Product, characterKey: string): number {
  const ledger = product.effectLedger
  const targetedXp = ledger?.advancementBalances[`${characterKey}:xp:${product.advancement.currencyKey}`] ?? 0
  const targetedCurrency = ledger?.advancementBalances[`${characterKey}:${product.advancement.currencyKey}`] ?? 0
  return Math.max(0, product.advancement.totalAwarded + targetedXp + targetedCurrency)
}
