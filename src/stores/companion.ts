import { create } from 'zustand';

export interface CompanionPreferences {
  visible: boolean
  portrait: string
}
export const DEFAULT_COMPANION: CompanionPreferences = { visible: true, portrait: '' }

export const COMPANION_KEY = 'storyforge-longform-companion-v1'
const SESSION_KEY = 'storyforge-longform-voice-keys-v1'

export function sanitizeCompanion(raw: unknown): CompanionPreferences {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    ...DEFAULT_COMPANION,
    visible: value.visible !== false,
    portrait: typeof value.portrait === 'string' && value.portrait.length < 2_800_000
      && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.portrait) ? value.portrait : '',
  }
}
const STORAGE_ERROR = '浏览器存储空间或权限不足，本次设置仅在当前页面有效。'
function loadPreferences(): Pick<Store, 'preferences' | 'storageError'> {
  let preferences = sanitizeCompanion({})
  let storageError = ''
  try { sessionStorage.removeItem(SESSION_KEY) } catch { storageError = STORAGE_ERROR }
  try {
    const raw = localStorage.getItem(COMPANION_KEY)
    preferences = sanitizeCompanion(JSON.parse(raw || '{}'))
    const saved = JSON.stringify(preferences)
    if (raw !== null && raw !== saved) localStorage.setItem(COMPANION_KEY, saved)
  } catch { storageError = STORAGE_ERROR }
  return { preferences, storageError }
}
interface Store {
  preferences: CompanionPreferences
  storageError: string
  update: (patch: Partial<CompanionPreferences>) => void
}
export const useCompanionStore = create<Store>((set, get) => ({
  ...loadPreferences(),
  update: (patch) => {
    const merged = { ...get().preferences, ...patch }
    const next = sanitizeCompanion(merged)
    let storageError = ''
    try { sessionStorage.removeItem(SESSION_KEY) } catch { storageError = STORAGE_ERROR }
    try {
      localStorage.setItem(COMPANION_KEY, JSON.stringify(next))
    } catch { storageError = STORAGE_ERROR }
    set({ preferences: next, storageError })
  },
}))
