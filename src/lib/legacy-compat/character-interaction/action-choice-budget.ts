/** System-owned event metadata, never part of the model's action object. An
 * absent version preserves the historical two-call action/review allowance. */
export function parseChatActionChoiceVersionV1(value: unknown): 1 | undefined {
  if (value === undefined || value === 1) return value
  throw new Error('[chat-action-choice] 行动选择版本无效')
}

export function chatReviewedActionAllowanceV1(value: unknown): 2 | 3 {
  return parseChatActionChoiceVersionV1(value) === 1 ? 3 : 2
}
