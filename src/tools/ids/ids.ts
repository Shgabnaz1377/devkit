/*
 * UUID v4 / v7 (RFC 9562) and ULID generation and inspection.
 * Randomness and clock are injectable so ordering can be tested deterministically.
 */

export type RandomFill = (bytes: Uint8Array) => Uint8Array
export type Clock = () => number

export const cryptoRandom: RandomFill = (bytes) => {
  crypto.getRandomValues(bytes as Uint8Array<ArrayBuffer>)
  return bytes
}

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

export function formatUuid(b: Uint8Array): string {
  const h = Array.from(b, (x) => HEX[x]!)
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
}

export function uuidv4(random: RandomFill = cryptoRandom): string {
  const b = random(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  return formatUuid(b)
}

/**
 * UUIDv7 generator with a 12-bit counter in `rand_a` (RFC 9562 section 6.2,
 * method 1), so IDs created in the same millisecond still sort in creation
 * order. On counter overflow the timestamp is advanced by 1 ms; a clock that
 * moves backwards never produces a smaller ID.
 */
export function createUuidV7Generator(clock: Clock = Date.now, random: RandomFill = cryptoRandom): () => string {
  let lastMs = -1
  let counter = 0
  return () => {
    let ms = clock()
    if (ms > lastMs) {
      // Seed the counter randomly in the lower half so there is room to increment.
      counter = random(new Uint8Array(2)).reduce((a, x) => (a << 8) | x, 0) & 0x7ff
      lastMs = ms
    } else {
      ms = lastMs
      counter++
      if (counter > 0xfff) {
        lastMs = ms = lastMs + 1
        counter = 0
      }
    }
    const b = random(new Uint8Array(16))
    // 48-bit big-endian millisecond timestamp.
    let t = ms
    for (let i = 5; i >= 0; i--) {
      b[i] = t % 256
      t = Math.floor(t / 256)
    }
    b[6] = 0x70 | (counter >> 8)
    b[7] = counter & 0xff
    b[8] = (b[8]! & 0x3f) | 0x80
    return formatUuid(b)
  }
}

/* --------------------------------- ULID -------------------------------- */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const MAX_ULID_TIME = 2 ** 48 - 1

export function encodeUlidTime(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_ULID_TIME) throw new RangeError('ULID time must be an integer between 0 and 2^48-1.')
  let out = ''
  let t = ms
  for (let i = 0; i < 10; i++) {
    out = CROCKFORD[t % 32]! + out
    t = Math.floor(t / 32)
  }
  return out
}

/** Monotonic ULID factory: within one millisecond the random part increments by 1. */
export function createUlidGenerator(clock: Clock = Date.now, random: RandomFill = cryptoRandom): () => string {
  let lastMs = -1
  let lastRandom: number[] = [] // 16 base32 digits
  return () => {
    const now = clock()
    if (now > lastMs) {
      lastMs = now
      lastRandom = Array.from(random(new Uint8Array(16)), (x) => x % 32)
    } else {
      let i = 15
      while (i >= 0 && lastRandom[i] === 31) lastRandom[i--] = 0
      if (i < 0) throw new Error('ULID random component overflowed within one millisecond.')
      lastRandom[i]!++
    }
    return encodeUlidTime(lastMs) + lastRandom.map((d) => CROCKFORD[d]).join('')
  }
}

/* ------------------------------- inspect ------------------------------- */

export interface IdInfo {
  kind: 'uuid' | 'ulid'
  canonical: string
  version?: number
  variant?: string
  /** Embedded creation time, when the format has one. */
  time?: Date
  notes: string[]
}

export class IdError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function inspectId(raw: string): IdInfo {
  let s = raw.trim()
  if (s === '') throw new IdError('Paste a UUID or ULID to inspect it.')
  s = s.replace(/^urn:uuid:/i, '').replace(/^\{(.*)\}$/, '$1')
  if (/^[0-9a-f]{32}$/i.test(s)) s = s.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
  const lower = s.toLowerCase()
  if (UUID_RE.test(lower)) return inspectUuid(lower)
  if (s.length === 26) return inspectUlid(s)
  if (s.includes('-') || s.length === 36) throw new IdError('Not a valid UUID: expected 32 hex digits as 8-4-4-4-12.')
  throw new IdError(`Not a UUID (36 characters) or ULID (26 characters); got ${s.length} characters.`)
}

function inspectUuid(u: string): IdInfo {
  const notes: string[] = []
  if (u === '00000000-0000-0000-0000-000000000000') return { kind: 'uuid', canonical: u, notes: ['The nil UUID.'] }
  if (u === 'ffffffff-ffff-ffff-ffff-ffffffffffff') return { kind: 'uuid', canonical: u, notes: ['The max UUID (RFC 9562).'] }
  const version = parseInt(u[14]!, 16)
  const v = parseInt(u[19]!, 16)
  const variant = v < 8 ? 'NCS (reserved)' : v < 12 ? 'RFC 9562' : v < 14 ? 'Microsoft (reserved)' : 'future (reserved)'
  if (variant !== 'RFC 9562') notes.push('The variant bits are not the standard RFC 9562 variant.')
  let time: Date | undefined
  const hex = u.replace(/-/g, '')
  if (version === 7) {
    time = new Date(parseInt(hex.slice(0, 12), 16))
  } else if (version === 1 || version === 6) {
    // 60-bit count of 100 ns intervals since 1582-10-15.
    const ts =
      version === 1
        ? BigInt(`0x${hex.slice(13, 16)}${hex.slice(8, 12)}${hex.slice(0, 8)}`)
        : BigInt(`0x${hex.slice(0, 12)}${hex.slice(13, 16)}`)
    time = new Date(Number((ts - 122192928000000000n) / 10000n))
  } else if (version === 4) {
    notes.push('Random UUID: it carries no timestamp.')
  } else if (version === 3 || version === 5) {
    notes.push(`Name-based UUID (${version === 3 ? 'MD5' : 'SHA-1'} hash): it carries no timestamp.`)
  } else if (version < 1 || version > 8) {
    notes.push(`Version ${version} is not defined by RFC 9562.`)
  }
  return { kind: 'uuid', canonical: u, version, variant, time, notes }
}

function inspectUlid(s: string): IdInfo {
  const upper = s.toUpperCase()
  const bad = /[^0-9A-HJKMNP-TV-Z]/.exec(upper)
  if (bad) throw new IdError(`"${s[bad.index]}" is not a Crockford base32 character (ULIDs exclude I, L, O and U).`)
  if (upper[0]! > '7') throw new IdError('This ULID is out of range: its first character must be 0-7.')
  let ms = 0
  for (const ch of upper.slice(0, 10)) ms = ms * 32 + CROCKFORD.indexOf(ch)
  return { kind: 'ulid', canonical: upper, time: new Date(ms), notes: [] }
}
