
import { type ChatSourceClassificationV1, type ChatSourceFragmentV1 } from './source-projection';

export interface ChatSourceReviewContextV1 {
  schema: 'storyforge.chat-source-review-context'
  version: 1
  draftRevision: number
  projectionHash: string
  worldReferenceHash: string
  worldReleaseHash: string
  audience: 'author-only'
  perspective?: {actorKey: string}
  cast: Array<{resourceKey: string; authorLabel?: string; role: 'actor' | 'player'}>
  fragments: Array<ChatSourceFragmentV1 & {
    sourceHash: string
    resourceKind: string
    origin?: 'product-private'
    confirmedClassification: ChatSourceClassificationV1 | null
    /** Actor-limited reading excludes author permissions and discovery conditions. */
    knownPurpose?: ChatSourceClassificationV1['purpose']
  }>
}
