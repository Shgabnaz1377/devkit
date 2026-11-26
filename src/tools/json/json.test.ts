import { describe, expect, it } from 'vitest'
import { childPath, diffJson, findUnsafeIntegers, formatJson, jsonStats, lineColumn, parseJson, sortKeysDeep } from './json'

function err(text: string) {
  const r = parseJson(text)
  if (r.ok) throw new Error('expected a parse error')
  return r.error
}

describe('parseJson', () => {
  it('parses valid documents of every top-level type', () => {
    for (const [text, value] of [
      ['{"a":1}', { a: 1 }],
      ['[1,2]', [1, 2]],
      ['"s"', 's'],
      ['  42  ', 42],
      ['null', null],
      ['-0.5e3', -500],
    ] as const) {
      expect(parseJson(text)).toEqual({ ok: true, value })
    }
  })

  it('reports empty input', () => {
    expect(err('   ').message).toMatch(/empty/)
  })

  it('locates a trailing comma with line and column', () => {
    const e = err('{\n  "a": 1,\n}')
    expect(e.message).toMatch(/Trailing comma/)
    expect(e.hint).toMatch(/Remove the last comma/)
    expect([e.line, e.column]).toEqual([2, 9])
  })

  it('explains unquoted keys, single quotes and comments', () => {
    expect(err('{a: 1}').hint).toMatch(/double-quoted/)
    expect(err("{'a': 1}").hint).toMatch(/double quotes/)
    expect(err("['x']").hint).toMatch(/double quotes/)
    expect(err('{"a": 1 // note\n}').message).toMatch(/expected "," or "}"/)
    expect(err('// c\n{}').message).toMatch(/Comments are not allowed/)
  })

  it('catches missing commas, colons and brackets', () => {
    expect(err('{"a": 1 "b": 2}').hint).toMatch(/comma is probably missing/)
    expect(err('{"a" 1}').message).toMatch(/expected ":"/)
    expect(err('[1, 2').message).toMatch(/end of input/)
    expect(err('[1,]').message).toMatch(/Trailing comma before "\]"/)
  })

  it('rejects invalid numbers and JS-only literals', () => {
    expect(err('[01]').hint).toMatch(/leading zeros/)
    expect(err('[1.]').message).toMatch(/Invalid number/)
    expect(err('[NaN]').message).toMatch(/NaN is not a JSON value/)
    expect(err('{"a": undefined}').message).toMatch(/undefined is not a JSON value/)
  })

  it('rejects bad strings', () => {
    expect(err('"abc').message).toMatch(/Unterminated string/)
    expect(err('"a\nb"').message).toMatch(/Unescaped line break/)
    expect(err('"\\x"').message).toMatch(/Invalid escape/)
    expect(err('"\\u12G4"').message).toMatch(/4 hex digits/)
  })

  it('rejects content after the top-level value', () => {
    const e = err('{} {}')
    expect(e.message).toMatch(/after the end/)
    expect(e.column).toBe(4)
  })
})

describe('lineColumn', () => {
  it('maps offsets to 1-based positions', () => {
    expect(lineColumn('ab\ncd', 0)).toEqual({ line: 1, column: 1 })
    expect(lineColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 })
  })
})

describe('findUnsafeIntegers', () => {
  it('flags integers beyond 2^53 but ignores strings and safe numbers', () => {
    expect(findUnsafeIntegers('{"id": 12345678901234567890, "s": "99999999999999999999", "n": 9007199254740991}')).toEqual([
      '12345678901234567890',
    ])
    expect(findUnsafeIntegers('[1.5e300, -9007199254740993]')).toEqual(['-9007199254740993'])
  })
})

describe('formatJson', () => {
  const v = { b: 1, a: [1, { d: 1, c: 2 }] }

  it('supports minified, 2/4 spaces and tabs', () => {
    expect(formatJson(v, 0)).toBe('{"b":1,"a":[1,{"d":1,"c":2}]}')
    expect(formatJson({ a: 1 }, 2)).toBe('{\n  "a": 1\n}')
    expect(formatJson({ a: 1 }, 4)).toBe('{\n    "a": 1\n}')
    expect(formatJson({ a: 1 }, '\t')).toBe('{\n\t"a": 1\n}')
  })

  it('sorts keys recursively without touching array order', () => {
    expect(formatJson(v, 0, true)).toBe('{"a":[1,{"c":2,"d":1}],"b":1}')
    expect(sortKeysDeep([3, 1, 2])).toEqual([3, 1, 2])
  })
})

describe('jsonStats', () => {
  it('counts containers, keys and depth', () => {
    expect(jsonStats({ a: [1, { b: null }], c: {} })).toEqual({ objects: 3, arrays: 1, keys: 3, maxDepth: 3 })
    expect(jsonStats(5)).toEqual({ objects: 0, arrays: 0, keys: 0, maxDepth: 0 })
  })
})

describe('diffJson', () => {
  it('returns no changes for equal values regardless of key order', () => {
    expect(diffJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toEqual([])
  })

  it('reports added, removed and changed paths', () => {
    expect(diffJson({ a: 1, b: 2, n: { x: true } }, { a: 1, b: 3, c: 4, n: {} })).toEqual([
      { kind: 'changed', path: '$.b', before: 2, after: 3 },
      { kind: 'removed', path: '$.n.x', before: true },
      { kind: 'added', path: '$.c', after: 4 },
    ])
  })

  it('compares arrays by index', () => {
    expect(diffJson([1, 2], [1, 3, 4])).toEqual([
      { kind: 'changed', path: '$[1]', before: 2, after: 3 },
      { kind: 'added', path: '$[2]', after: 4 },
    ])
    expect(diffJson([1, 2], [1])).toEqual([{ kind: 'removed', path: '$[1]', before: 2 }])
  })

  it('treats type changes as one change', () => {
    expect(diffJson({ a: [1] }, { a: { 0: 1 } })).toEqual([{ kind: 'changed', path: '$.a', before: [1], after: { 0: 1 } }])
    expect(diffJson(null, {})).toHaveLength(1)
    expect(diffJson(1, '1')).toHaveLength(1)
  })

  it('quotes keys that are not identifiers', () => {
    expect(childPath('$', 'a b')).toBe('$["a b"]')
    expect(childPath('$', '0')).toBe('$["0"]')
    expect(childPath('$', 'ok_1')).toBe('$.ok_1')
  })
})
