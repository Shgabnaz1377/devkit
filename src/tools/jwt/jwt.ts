import { fromBase64Url, toBase64Url } from '../../lib/share'

export class JwtError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JwtError'
  }
}

export interface DecodedJwt {
  header: Record<string, unknown>
  payload: unknown
  /** Raw base64url signature segment (may be empty for alg "none"). */
  signature: string
  /** `<header>.<payload>` exactly as received: the bytes that were signed. */
  signingInput: string
  parts: [string, string, string]
}

/** Strip whitespace and an optional `Bearer ` prefix copied from a header. */
export function normalizeToken(raw: string): string {
  return raw.trim().replace(/^bearer\s+/i, '').replace(/\s+/g, '')
}

function decodeSegment(segment: string, name: string): string {
  if (segment === '') throw new JwtError(`The ${name} segment is empty.`)
  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(segment)
  } catch {
    const bad = segment.match(/[^A-Za-z0-9_-]/)?.[0]
    throw new JwtError(
      bad
        ? `The ${name} is not valid base64url: unexpected character "${bad}". JWTs use "-" and "_" instead of "+" and "/", with no "=" padding.`
        : `The ${name} is not valid base64url: its length (${segment.length}) is impossible for base64.`,
    )
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new JwtError(`The ${name} decodes to bytes that are not valid UTF-8 text.`)
  }
}

function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (e) {
    throw new JwtError(`The ${name} is not valid JSON: ${(e as Error).message}`)
  }
}

export function decodeJwt(raw: string): DecodedJwt {
  const token = normalizeToken(raw)
  if (token === '') throw new JwtError('Paste a token to decode it.')
  const parts = token.split('.')
  if (parts.length === 5) {
    throw new JwtError('This has 5 segments, so it is an encrypted JWE. Only signed JWTs (JWS, 3 segments) can be decoded without the key.')
  }
  if (parts.length !== 3) {
    throw new JwtError(`A JWT has 3 segments separated by dots (header.payload.signature); this has ${parts.length}.`)
  }
  const [h, p, s] = parts as [string, string, string]

  const header = parseJson(decodeSegment(h, 'header'), 'header')
  if (typeof header !== 'object' || header === null || Array.isArray(header)) {
    throw new JwtError('The header must be a JSON object.')
  }
  if (typeof (header as Record<string, unknown>).alg !== 'string') {
    throw new JwtError('The header has no "alg" field, which every JWT must declare.')
  }
  const payloadText = decodeSegment(p, 'payload')
  // RFC 7519 payloads are JSON objects, but JWS can carry any bytes; show text if it isn't JSON.
  let payload: unknown
  try {
    payload = JSON.parse(payloadText) as unknown
  } catch {
    payload = payloadText
  }
  return { header: header as Record<string, unknown>, payload, signature: s, signingInput: `${h}.${p}`, parts: [h, p, s] }
}

/* ---------------------------- time claims ---------------------------- */

export type ClaimStatus = 'valid' | 'expired' | 'not-yet-valid' | 'no-expiry'

export interface TimeClaim {
  name: 'exp' | 'nbf' | 'iat'
  label: string
  seconds: number
  iso: string
  relative: string
}

export interface ClaimsSummary {
  status: ClaimStatus
  timeClaims: TimeClaim[]
  /** Problems with the claim values themselves (wrong types, etc.). */
  warnings: string[]
}

const TIME_LABELS = { exp: 'Expires', nbf: 'Not before', iat: 'Issued at' } as const

export function describeRelative(deltaSeconds: number): string {
  const abs = Math.abs(deltaSeconds)
  const units: [number, string][] = [
    [365 * 86400, 'year'],
    [30 * 86400, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ]
  if (abs < 1) return 'now'
  for (const [size, unit] of units) {
    if (abs >= size) {
      const n = Math.floor(abs / size)
      const text = `${n} ${unit}${n === 1 ? '' : 's'}`
      return deltaSeconds < 0 ? `${text} ago` : `in ${text}`
    }
  }
  return 'now'
}

/**
 * Inspect exp/nbf/iat. `nowSeconds` is injectable for tests; `leewaySeconds`
 * mirrors the clock-skew tolerance most JWT libraries apply.
 */
export function summarizeClaims(payload: unknown, nowSeconds: number, leewaySeconds = 0): ClaimsSummary {
  const warnings: string[] = []
  const timeClaims: TimeClaim[] = []
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { status: 'no-expiry', timeClaims, warnings: ['The payload is not a JSON object, so it has no registered claims.'] }
  }
  const obj = payload as Record<string, unknown>
  for (const name of ['iat', 'nbf', 'exp'] as const) {
    const v = obj[name]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      warnings.push(`"${name}" should be a number of seconds since the epoch, got ${JSON.stringify(v)}.`)
      continue
    }
    if (v > 1e11) warnings.push(`"${name}" looks like milliseconds; JWT times are in seconds.`)
    const date = new Date(v * 1000)
    timeClaims.push({
      name,
      label: TIME_LABELS[name],
      seconds: v,
      iso: Number.isNaN(date.getTime()) ? 'out of range' : date.toISOString(),
      relative: describeRelative(v - nowSeconds),
    })
  }
  const exp = timeClaims.find((c) => c.name === 'exp')
  const nbf = timeClaims.find((c) => c.name === 'nbf')
  const iat = timeClaims.find((c) => c.name === 'iat')
  if (iat && exp && iat.seconds > exp.seconds) warnings.push('"iat" is after "exp": the token expired before it was issued.')
  if (iat && iat.seconds > nowSeconds + leewaySeconds) warnings.push('"iat" is in the future; check the issuer clock.')

  let status: ClaimStatus = exp ? 'valid' : 'no-expiry'
  if (nbf && nowSeconds + leewaySeconds < nbf.seconds) status = 'not-yet-valid'
  else if (exp && nowSeconds - leewaySeconds >= exp.seconds) status = 'expired'
  return { status, timeClaims, warnings }
}

/* ---------------------------- HMAC verify ---------------------------- */

export type HmacAlg = 'HS256' | 'HS384' | 'HS512'
export type SecretEncoding = 'utf8' | 'base64' | 'base64url' | 'hex'

const HASH: Record<HmacAlg, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }

export function isHmacAlg(alg: unknown): alg is HmacAlg {
  return alg === 'HS256' || alg === 'HS384' || alg === 'HS512'
}

export function secretToBytes(secret: string, encoding: SecretEncoding): Uint8Array {
  switch (encoding) {
    case 'utf8':
      return new TextEncoder().encode(secret)
    case 'hex': {
      const clean = secret.replace(/\s+/g, '')
      if (!/^(?:[0-9a-fA-F]{2})*$/.test(clean)) throw new JwtError('The secret is not valid hex (an even number of 0-9 / a-f characters).')
      const out = new Uint8Array(clean.length / 2)
      for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
      return out
    }
    case 'base64':
    case 'base64url': {
      const clean = secret.trim().replace(/=+$/, '')
      const normalized = encoding === 'base64' ? clean.replace(/\+/g, '-').replace(/\//g, '_') : clean
      try {
        return fromBase64Url(normalized)
      } catch {
        throw new JwtError(`The secret is not valid ${encoding}.`)
      }
    }
  }
}

async function importKey(secret: Uint8Array, alg: HmacAlg, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: HASH[alg] }, false, [usage])
}

/** Sign `signingInput` and return the base64url signature. */
export async function signHmac(signingInput: string, secret: Uint8Array, alg: HmacAlg): Promise<string> {
  const key = await importKey(secret, alg, 'sign')
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  return toBase64Url(new Uint8Array(sig))
}

export type VerifyResult =
  | { ok: true; alg: HmacAlg }
  | { ok: false; reason: string }

export async function verifyHmac(raw: string, secret: string, encoding: SecretEncoding = 'utf8'): Promise<VerifyResult> {
  let decoded: DecodedJwt
  try {
    decoded = decodeJwt(raw)
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
  const alg = decoded.header.alg
  if (alg === 'none') return { ok: false, reason: 'The token uses alg "none": it is unsigned and must never be trusted.' }
  if (!isHmacAlg(alg)) {
    return { ok: false, reason: `alg "${String(alg)}" uses a public/private key pair; only HMAC tokens (HS256, HS384, HS512) can be checked with a shared secret here.` }
  }
  if (secret === '') return { ok: false, reason: 'Enter the shared secret to verify the signature.' }
  let key: Uint8Array
  try {
    key = secretToBytes(secret, encoding)
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
  if (key.length === 0) return { ok: false, reason: 'The secret decodes to zero bytes.' }
  let sigBytes: Uint8Array
  try {
    sigBytes = fromBase64Url(decoded.signature)
  } catch {
    return { ok: false, reason: 'The signature segment is not valid base64url.' }
  }
  const cryptoKey = await importKey(key, alg, 'verify')
  // subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify('HMAC', cryptoKey, sigBytes as BufferSource, new TextEncoder().encode(decoded.signingInput))
  return valid ? { ok: true, alg } : { ok: false, reason: 'Invalid signature: the secret is wrong or the token was modified.' }
}
