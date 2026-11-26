import { describe, expect, it } from 'vitest'
import { IdError, createUlidGenerator, createUuidV7Generator, encodeUlidTime, inspectId, uuidv4, type RandomFill } from './ids'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Deterministic PRNG (mulberry32) so tests are reproducible. */
function seeded(seed: number): RandomFill {
  let a = seed
  return (bytes) => {
    for (let i = 0; i < bytes.length; i++) {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      bytes[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff
    }
    return bytes
  }
}

const maxBytes: RandomFill = (b) => b.fill(0xff)

describe('uuidv4', () => {
  it('sets version 4 and the RFC variant', () => {
    for (let i = 0; i < 200; i++) {
      const u = uuidv4()
      expect(u).toMatch(UUID_RE)
      expect(u[14]).toBe('4')
      expect('89ab').toContain(u[19])
    }
  })

  it('forces the version/variant bits even when randomness is all ones', () => {
    expect(uuidv4(maxBytes)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 5000 }, () => uuidv4())).size).toBe(5000)
  })
})

describe('uuidv7', () => {
  it('encodes the millisecond timestamp in the first 48 bits', () => {
    const gen = createUuidV7Generator(() => 0x017f22e279b0, seeded(1))
    const u = gen()
    expect(u.startsWith('017f22e2-79b0-7')).toBe(true)
    expect('89ab').toContain(u[19])
    expect(inspectId(u).time?.getTime()).toBe(0x017f22e279b0)
  })

  it('is strictly increasing for many IDs within the same millisecond', () => {
    const gen = createUuidV7Generator(() => 1_700_000_000_000, seeded(42))
    const ids = Array.from({ length: 10_000 }, gen)
    for (let i = 1; i < ids.length; i++) expect(ids[i]! > ids[i - 1]!).toBe(true)
  })

  it('sorts in creation order across milliseconds', () => {
    let t = 1_700_000_000_000
    const gen = createUuidV7Generator(() => (t += Math.random() < 0.5 ? 0 : 1), seeded(7))
    const ids = Array.from({ length: 2000 }, gen)
    expect([...ids].sort()).toEqual(ids)
  })

  it('never goes backwards when the clock does', () => {
    const times = [5_000, 5_000, 4_000, 3_000, 5_001]
    const gen = createUuidV7Generator(() => times.shift()!, seeded(3))
    const ids = Array.from({ length: 5 }, gen)
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(5)
  })

  it('rolls the timestamp forward when the 12-bit counter overflows', () => {
    const gen = createUuidV7Generator(() => 1000, maxBytes)
    const ids = Array.from({ length: 4097 }, gen)
    expect([...ids].sort()).toEqual(ids)
    expect(inspectId(ids[ids.length - 1]!).time!.getTime()).toBeGreaterThan(1000)
  })
})

describe('ulid', () => {
  it('encodes time per the spec example', () => {
    expect(encodeUlidTime(1469918176385)).toBe('01ARYZ6S41')
    expect(encodeUlidTime(0)).toBe('0000000000')
    expect(encodeUlidTime(2 ** 48 - 1)).toBe('7ZZZZZZZZZ')
    expect(() => encodeUlidTime(2 ** 48)).toThrow(RangeError)
  })

  it('produces 26 Crockford characters that decode to the creation time', () => {
    const id = createUlidGenerator(() => 1469918176385, seeded(9))()
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(id.startsWith('01ARYZ6S41')).toBe(true)
    expect(inspectId(id).time?.getTime()).toBe(1469918176385)
  })

  it('is monotonic within one millisecond', () => {
    const gen = createUlidGenerator(() => 1_700_000_000_000, seeded(5))
    const ids = Array.from({ length: 5000 }, gen)
    for (let i = 1; i < ids.length; i++) expect(ids[i]! > ids[i - 1]!).toBe(true)
  })

  it('carries the increment across digits and throws on overflow', () => {
    const gen = createUlidGenerator(() => 1, maxBytes) // 0xff % 32 = 31: random part is all "Z"
    gen()
    expect(() => gen()).toThrow(/overflowed/)
  })
})

describe('inspectId', () => {
  it('identifies UUID versions and variants', () => {
    expect(inspectId('f81d4fae-7dec-11d0-a765-00a0c91e6bf6')).toMatchObject({ version: 1, variant: 'RFC 9562' })
    expect(inspectId('919108f7-52d1-4320-9bac-f847db4148a8')).toMatchObject({ version: 4, notes: ['Random UUID: it carries no timestamp.'] })
    expect(inspectId('2ed6657d-e927-568b-95e1-2665a8aea6a2').notes[0]).toMatch(/SHA-1/)
  })

  it('extracts the v1 timestamp (RFC 4122 example: 1997-02-03)', () => {
    expect(inspectId('f81d4fae-7dec-11d0-a765-00a0c91e6bf6').time?.toISOString()).toBe('1997-02-03T17:43:12.216Z')
  })

  it('extracts the v6 timestamp from the RFC 9562 example', () => {
    expect(inspectId('1ec9414c-232a-6b00-b3c8-9f6bdeced846').time?.toISOString()).toBe('2022-02-22T19:22:22.000Z')
  })

  it('extracts the v7 timestamp from the RFC 9562 example', () => {
    expect(inspectId('017F22E2-79B0-7CC3-98C4-DC0C0C07398F').time?.toISOString()).toBe('2022-02-22T19:22:22.000Z')
  })

  it('accepts braces, urn prefix and compact hex', () => {
    expect(inspectId('{919108F7-52D1-4320-9BAC-F847DB4148A8}').canonical).toBe('919108f7-52d1-4320-9bac-f847db4148a8')
    expect(inspectId('urn:uuid:919108f7-52d1-4320-9bac-f847db4148a8').version).toBe(4)
    expect(inspectId('919108f752d143209bacf847db4148a8').canonical).toBe('919108f7-52d1-4320-9bac-f847db4148a8')
  })

  it('recognises the nil and max UUIDs', () => {
    expect(inspectId('00000000-0000-0000-0000-000000000000').notes[0]).toMatch(/nil/)
    expect(inspectId('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF').notes[0]).toMatch(/max/)
  })

  it('flags non-standard variants', () => {
    expect(inspectId('919108f7-52d1-4320-0bac-f847db4148a8').notes.join(' ')).toMatch(/variant/)
  })

  it.each([
    ['', /Paste a UUID/],
    ['919108f7-52d1-4320-9bac-f847db4148a', /8-4-4-4-12/],
    ['919108g7-52d1-4320-9bac-f847db4148a8', /8-4-4-4-12/],
    ['01ARYZ6S41ILOU0000000000AB', /"I" is not a Crockford/],
    ['81ARYZ6S410000000000000000', /out of range/],
    ['hello', /got 5 characters/],
  ])('rejects %j', (input, message) => {
    expect(() => inspectId(input)).toThrow(IdError)
    expect(() => inspectId(input)).toThrow(message)
  })
})
