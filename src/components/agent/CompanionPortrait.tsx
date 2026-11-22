import { useCompanionStore } from '../../stores/companion'

export const COMPANION_POSES = {
  idle: { position: '0% 0%', label: '陪你构思' },
  thinking: { position: '100% 0%', label: '正在思考' },
  ready: { position: '50% 100%', label: '候选待你确认' },
  error: { position: '100% 100%', label: '需要处理' },
} as const
export type CompanionPose = keyof typeof COMPANION_POSES
export function companionPose(busy: boolean, pending: boolean, error: boolean): CompanionPose {
  if (busy) return 'thinking'
  if (error) return 'error'
  return pending ? 'ready' : 'idle'
}
export default function CompanionPortrait({ pose, compact = false }: { pose: CompanionPose; compact?: boolean }) {
  const portrait = useCompanionStore((state) => state.preferences.portrait)
  const visible = useCompanionStore((state) => state.preferences.visible)
  if (!visible) return null
  return (
    <span
      role="img" aria-label={'炉娘 · ' + COMPANION_POSES[pose].label}
      className={`companion-portrait ${compact ? 'companion-portrait-compact' : ''} ${portrait ? 'companion-portrait-custom' : ''}`}
      data-pose={pose}
      style={{
        backgroundImage: `url("${portrait || import.meta.env.BASE_URL + 'companion/moling-atlas.png'}")`,
        backgroundPosition: portrait ? 'center' : COMPANION_POSES[pose].position,
      }}
    />
  )
}
