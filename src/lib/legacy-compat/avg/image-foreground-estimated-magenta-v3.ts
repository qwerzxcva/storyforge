/** Explicit, local recovery for a mostly uniform but slightly shifted magenta
 * backdrop. This is a separate algorithm from exact-key V1 and boundary
 * unmix V2; it never changes the frozen provider request or accepts uncertain
 * borders. The output remains a candidate for visual review and adoption. */
export const AVG_FOREGROUND_ESTIMATED_MAGENTA_ID_V3 = 'storyforge.avg.foreground.estimated-magenta-edge-unmix.v3' as const
