import { parseTtrpgDiceExpressionV2 } from '../ttrpg/dice';

export function parseProductRuntimeDiceExpressionV1(expression: string): {
  normalized: string
  count: number
  sides: number
  modifier: number
} {
  return parseTtrpgDiceExpressionV2(expression)
}
