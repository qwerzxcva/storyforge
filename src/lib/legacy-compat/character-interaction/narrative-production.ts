
import { canonicalProductProductionJsonV2 } from '../product-production/hash';
import type { FrozenChatNarrativeV1 } from '../../types/chat-narrative';
import type { ProductRuntimePackageV1 } from '../../types/index';

/** Public package navigation only. Hidden setup and future possibilities stay
 * in the interaction module and never become authored future dialogue. */
export function chatNarrativeShellV1(content: FrozenChatNarrativeV1): ProductRuntimePackageV1['narrative'] & {
  schema: 'storyforge.product-narrative-artifact'; version: 1
} {
  const situation = content.initialSituation
  const text = [situation.location, situation.timeLabel].filter(Boolean).join(' · ')
  return {
    schema: 'storyforge.product-narrative-artifact', version: 1,
    moduleKind: 'main', moduleTitle: situation.title, entryNodeKey: situation.sceneKey,
    nodes: [{key: situation.sceneKey, kind: 'entry', title: situation.title, summary: text,
      conditionJson: '{}', effectsJson: '[]', successorKeys: []}],
    beats: [{beatKey: 'chat.setting', nodeKey: situation.sceneKey, kind: 'narration', speakerKey: null, text, order: 0}],
    choices: [],
  }
}

export function isChatNarrativeShellV1(narrative: ProductRuntimePackageV1['narrative'], content: FrozenChatNarrativeV1): boolean {
  const {schema: _schema, version: _version, ...expected} = chatNarrativeShellV1(content)
  return canonicalProductProductionJsonV2(narrative) === canonicalProductProductionJsonV2(expected)
}
