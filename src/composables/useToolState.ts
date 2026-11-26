import { reactive, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { decodeState, encodeState, mergeKnown, omitKeys } from '../lib/share'
import { readJSON, removeKey, writeJSON } from '../lib/storage'
import { settings, TOOL_STATE_PREFIX } from './useSettings'

export interface ToolStateOptions<T> {
  /** Keys never written to localStorage or share links (e.g. secrets). */
  privateKeys?: readonly (keyof T)[]
}

/**
 * Reactive state for a tool. Initial value comes from, in order: a `?s=` share
 * link, the last input saved in localStorage (if "remember input" is on), or
 * the given defaults.
 */
export function useToolState<T extends object>(toolId: string, defaults: T, options: ToolStateOptions<T> = {}) {
  const route = useRoute()
  const router = useRouter()
  const key = TOOL_STATE_PREFIX + toolId
  const privateKeys = options.privateKeys ?? []
  const fresh = () => structuredClone(defaults)

  let initial = fresh()
  const shared = typeof route.query.s === 'string' ? decodeState(route.query.s) : undefined
  if (shared !== undefined) {
    initial = mergeKnown(fresh(), shared)
    // Drop the payload from the address bar so later edits don't look shared.
    void router.replace({ path: route.path, query: {} })
  } else if (settings.remember) {
    initial = mergeKnown(fresh(), readJSON(key))
  }

  const state = reactive(initial) as T

  watch(
    state,
    (value) => {
      if (settings.remember) writeJSON(key, omitKeys(toRaw(value) as T, privateKeys))
    },
    { deep: true },
  )

  function shareUrl(): string {
    const payload = encodeState(omitKeys(toRaw(state) as T, privateKeys))
    const href = router.resolve({ path: route.path, query: { s: payload } }).href
    return new URL(href, window.location.href).toString()
  }

  function reset(): void {
    Object.assign(state, fresh())
    removeKey(key)
  }

  return { state, shareUrl, reset }
}
