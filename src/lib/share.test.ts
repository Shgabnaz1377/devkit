import { describe, expect, it } from 'vitest'
import { decodeState, encodeState, fromBase64Url, mergeKnown, omitKeys, toBase64Url } from './share'

describe('base64url', () => {
  it('round-trips arbitrary bytes without padding or unsafe characters', () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63, 1, 2])
    const enc = toBase64Url(bytes)
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(Array.from(fromBase64Url(enc))).toEqual(Array.from(bytes))
  })

  it('rejects invalid input', () => {
    expect(() => fromBase64Url('a+b/')).toThrow(/characters/)
    expect(() => fromBase64Url('abcde')).toThrow(/length/)
  })
})

describe('encodeState / decodeState', () => {
  it('round-trips unicode-heavy state', () => {
    const state = { input: 'héllo \u{1F44B} — 日本', n: 3, flag: true }
    expect(decodeState(encodeState(state))).toEqual(state)
  })

  it('returns undefined for garbage instead of throwing', () => {
    expect(decodeState('%%%')).toBeUndefined()
    expect(decodeState('bm90IGpzb24')).toBeUndefined() // "not json"
    expect(decodeState('')).toBeUndefined()
  })
})

describe('mergeKnown', () => {
  const defaults = { input: '', indent: 2, sort: false, tags: [] as string[] }

  it('keeps only known keys with matching types', () => {
    expect(mergeKnown(defaults, { input: 'x', indent: '4', sort: true, evil: 1, tags: ['a'] })).toEqual({
      input: 'x',
      indent: 2,
      sort: true,
      tags: ['a'],
    })
  })

  it('rejects arrays where an object or scalar is expected', () => {
    expect(mergeKnown({ opts: { a: 1 } }, { opts: [1] })).toEqual({ opts: { a: 1 } })
    expect(mergeKnown({ opts: { a: 1 } }, { opts: null })).toEqual({ opts: { a: 1 } })
  })

  it('ignores non-object candidates', () => {
    expect(mergeKnown(defaults, null)).toEqual(defaults)
    expect(mergeKnown(defaults, [1, 2])).toEqual(defaults)
    expect(mergeKnown(defaults, 'str')).toEqual(defaults)
  })
})

describe('omitKeys', () => {
  it('drops the listed keys without mutating the input', () => {
    const s = { token: 't', secret: 's' }
    expect(omitKeys(s, ['secret'])).toEqual({ token: 't' })
    expect(s.secret).toBe('s')
  })
})
