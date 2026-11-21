import type { ChatResult } from '../../ai/client'

export interface TextOpenWorldRuntimeAIExecutionObservationV1 {
  version: 1
  provider: string
  model: string
  routeCategory: string
  startedAt: number
  finishedAt: number
  timedOut: boolean
  requestLifecycle: NonNullable<ChatResult['requestLifecycle']>
  usage: ChatResult['usage'] | null
}
