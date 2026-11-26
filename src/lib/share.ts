/**
 * Encode tool state into a compact, URL-safe string (base64url of UTF-8 JSON)
 * so a tool's current input can be shared as a link. Decoding never throws:
 * a malformed or tampered value yields `undefined` and the tool falls back to
 * its defaults.
 */

export function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) throw new Error('Invalid base64url characters')
  if (input.length % 4 === 1) throw new Error('Invalid base64url length')
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function encodeState(state: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(state)))
}

export function decodeState(encoded: string): unknown {
  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(encoded))
    return JSON.parse(json) as unknown
  } catch {
    return undefined
  }
}

/**
 * Merge an untrusted decoded object onto defaults, keeping only known keys
 * whose runtime type matches the default's type.
 */
export function mergeKnown<T extends object>(defaults: T, candidate: unknown): T {
  const result = { ...defaults }
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return result
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = (candidate as Record<string, unknown>)[key as string]
    const def = defaults[key]
    if (value === undefined) continue
    const sameKind = Array.isArray(def)
      ? Array.isArray(value)
      : typeof value === typeof def && !Array.isArray(value) && (def === null) === (value === null)
    if (sameKind) result[key] = value as T[keyof T]
  }
  return result
}

/** Return a copy of `state` without the listed keys (used for secrets). */
export function omitKeys<T extends object>(state: T, keys: readonly (keyof T)[]): Partial<T> {
  const copy: Partial<T> = { ...state }
  for (const k of keys) delete copy[k]
  return copy
}
