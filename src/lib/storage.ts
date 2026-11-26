/**
 * localStorage wrapper that never throws. Storage can be unavailable (private
 * windows, blocked site data, quota errors); the app must keep working without it.
 */

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readJSON(key: string): unknown {
  try {
    const raw = store()?.getItem(key)
    return raw == null ? undefined : (JSON.parse(raw) as unknown)
  } catch {
    return undefined
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    store()?.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled: persistence is best-effort.
  }
}

export function removeKey(key: string): void {
  try {
    store()?.removeItem(key)
  } catch {
    // ignore
  }
}

export function removeByPrefix(prefix: string): void {
  const s = store()
  if (!s) return
  try {
    const keys: string[] = []
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k?.startsWith(prefix)) keys.push(k)
    }
    for (const k of keys) s.removeItem(k)
  } catch {
    // ignore
  }
}
