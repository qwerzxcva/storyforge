import { avgProtocolBody, avgRecord } from './protocol-validation';
import { parseAvgAssemblyBriefV3, type AvgAssemblyBriefV3 } from './voice-assembly-contract';
import { parseAvgVoiceExactStorageV1, type AvgVoiceExactStorageV1 } from './voice-exact-storage';

/** Shared Brief read representation. Only the voice value is opaque ASCII;
 * image V2, title, scene/media domains and lineage retain existing semantics.
 * New V3 production remains refused by commands until its full slice closes.
 */
export interface AvgStoredAssemblyBriefV3 extends Omit<AvgAssemblyBriefV3, 'voice'> {
  voice: AvgVoiceExactStorageV1
}

export function parseAvgStoredAssemblyBriefV3(value: unknown) {
  const row = avgRecord(avgProtocolBody(value), ['schema', 'version', 'title', 'sceneKeys', 'mediaAssetKeys',
    'basePackageHash', 'image', 'voice'], 'stored AVG voice assembly')
  const { packet, payload } = parseAvgVoiceExactStorageV1(row.voice, 'assembly-voice')
  const hasRecovery = !!payload && Object.prototype.hasOwnProperty.call(payload, 'recovery')
  const v = avgRecord(payload, ['schema', 'version', 'batch', 'protocol', 'binding', ...(hasRecovery ? ['recovery'] : [])], 'stored assembly voice')
  const assembly = parseAvgAssemblyBriefV3({ ...row, voice: { batch: v.batch, protocol: v.protocol, binding: v.binding,
    ...(hasRecovery ? { recovery: v.recovery } : {}) } })
  return { stored: { ...assembly, voice: packet } satisfies AvgStoredAssemblyBriefV3, assembly }
}
