import { base64EncodeBytes, bytesToHex } from '../encode/encode'

export const HASH_ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number]

export type DigestFormat = 'hex' | 'HEX' | 'base64'

export function formatDigest(bytes: Uint8Array, format: DigestFormat): string {
  if (format === 'base64') return base64EncodeBytes(bytes)
  const hex = bytesToHex(bytes)
  return format === 'HEX' ? hex.toUpperCase() : hex
}

export async function digestBytes(data: Uint8Array, algorithm: HashAlgorithm): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(algorithm, data as BufferSource))
}

export async function digestText(text: string, algorithm: HashAlgorithm): Promise<Uint8Array> {
  return digestBytes(new TextEncoder().encode(text), algorithm)
}

export async function hmac(data: Uint8Array, key: Uint8Array, algorithm: HashAlgorithm): Promise<Uint8Array> {
  if (key.length === 0) throw new Error('HMAC needs a non-empty key.')
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: algorithm }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource))
}

/** Compare a computed digest with one the user pasted, ignoring case, spaces and colons. */
export function digestMatches(computedHex: string, expected: string): boolean | null {
  const clean = expected.trim().toLowerCase().replace(/[\s:]/g, '')
  if (clean === '') return null
  return clean === computedHex.toLowerCase()
}

export const ALGORITHM_NOTES: Record<HashAlgorithm, string> = {
  'SHA-1': 'Broken for collision resistance; use only for legacy checksums (e.g. git object IDs).',
  'SHA-256': 'General-purpose default.',
  'SHA-384': 'Truncated SHA-512; resistant to length-extension attacks.',
  'SHA-512': 'Faster than SHA-256 on 64-bit CPUs for large inputs.',
}
