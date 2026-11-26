import { reactive, watch } from 'vue'
import { readJSON, removeByPrefix, writeJSON } from '../lib/storage'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemePreference
  /** Persist each tool's last input in localStorage. */
  remember: boolean
}

export const SETTINGS_KEY = 'devkit:settings'
export const TOOL_STATE_PREFIX = 'devkit:tool:'

function load(): Settings {
  const raw = readJSON(SETTINGS_KEY) as Partial<Settings> | undefined
  const theme = raw?.theme
  return {
    theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system',
    remember: typeof raw?.remember === 'boolean' ? raw.remember : true,
  }
}

export const settings = reactive<Settings>(load())

watch(
  settings,
  (s) => {
    writeJSON(SETTINGS_KEY, { theme: s.theme, remember: s.remember })
  },
  { deep: true },
)

// Turning persistence off also forgets everything that was stored so far.
watch(
  () => settings.remember,
  (remember) => {
    if (!remember) removeByPrefix(TOOL_STATE_PREFIX)
  },
)

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

export function effectiveTheme(): 'light' | 'dark' {
  if (settings.theme !== 'system') return settings.theme
  return darkQuery?.matches ? 'dark' : 'light'
}

function applyTheme(): void {
  if (typeof document === 'undefined') return
  const theme = effectiveTheme()
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

watch(() => settings.theme, applyTheme, { immediate: true })
darkQuery?.addEventListener('change', applyTheme)

export function cycleTheme(): void {
  const order: ThemePreference[] = ['system', 'light', 'dark']
  settings.theme = order[(order.indexOf(settings.theme) + 1) % order.length] ?? 'system'
}
