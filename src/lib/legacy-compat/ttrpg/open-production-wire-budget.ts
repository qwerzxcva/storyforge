/** Visible conservative approximation; never native/provider actual usage. */
export const TTRPG_OPEN_WIRE_ESTIMATION_V3 = 'zh-json-full-wire-conservative-v1' as const
export const TTRPG_OPEN_WIRE_OVERHEAD_RESERVE_V3 = 4096

export function estimateTtrpgOpenProductionTextV3(text: string): number {
  let ascii = 0, cjk = 0, otherBytes = 0
  const encoder = new TextEncoder()
  for (const char of text) {
    if (char.charCodeAt(0) < 128) ascii++
    else if (/[一-鿿㐀-䶿]/u.test(char)) cjk++
    else otherBytes += encoder.encode(char).length
  }
  return Math.ceil(ascii * 0.5 + cjk * 1.5 + otherBytes)
}
