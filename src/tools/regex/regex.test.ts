import { describe, expect, it } from 'vitest'
import { RegexError, buildRegex, escapeRegex, findMatches, groupNames, replaceAll, segmentText, splitLiteral, validateFlags } from './regex'

describe('validateFlags / buildRegex', () => {
  it('accepts valid flag combinations', () => {
    expect(() => validateFlags('gimsuyd')).not.toThrow()
    expect(buildRegex('a', 'gi').flags).toBe('gi')
  })

  it('rejects unknown, repeated and conflicting flags', () => {
    expect(() => validateFlags('gx')).toThrow(/Unknown flag "x"/)
    expect(() => validateFlags('gg')).toThrow(/repeated/)
    expect(() => validateFlags('uv')).toThrow(/cannot be combined/)
  })

  it('reports syntax errors without the engine boilerplate', () => {
    expect(() => buildRegex('(abc', '')).toThrow(RegexError)
    expect(() => buildRegex('(abc', '')).toThrow(/^Invalid pattern: (?!Invalid regular expression)/)
    expect(() => buildRegex('[z-a]', '')).toThrow(/Invalid pattern/)
    expect(() => buildRegex('\\p{Foo}', 'u')).toThrow(/Invalid pattern/)
  })

  it('requires a pattern', () => {
    expect(() => buildRegex('', 'g')).toThrow(/Enter a pattern/)
  })
})

describe('splitLiteral', () => {
  it('extracts pattern and flags from /literal/ syntax', () => {
    expect(splitLiteral('/ab+c/gi')).toEqual({ pattern: 'ab+c', flags: 'gi' })
    expect(splitLiteral('/a\\/b/')).toEqual({ pattern: 'a\\/b', flags: '' })
  })

  it('leaves bare patterns alone', () => {
    expect(splitLiteral('ab+c')).toEqual({ pattern: 'ab+c', flags: null })
    expect(splitLiteral('/')).toEqual({ pattern: '/', flags: null })
  })
})

describe('findMatches', () => {
  it('finds all matches with numbered and named groups', () => {
    const r = findMatches('(?<year>\\d{4})-(\\d{2})', 'g', 'from 2024-01 to 2025-12')
    expect(r.matches.map((m) => [m.index, m.end, m.text])).toEqual([
      [5, 12, '2024-01'],
      [16, 23, '2025-12'],
    ])
    expect(r.matches[0]!.groups).toEqual(['2024', '01'])
    expect(r.matches[1]!.named).toEqual({ year: '2025' })
  })

  it('returns only the first match without the g flag', () => {
    expect(findMatches('a', '', 'aaa').matches).toHaveLength(1)
  })

  it('marks groups that did not participate as undefined', () => {
    expect(findMatches('(a)|(b)', 'g', 'b').matches[0]!.groups).toEqual([undefined, 'b'])
  })

  it('handles zero-length matches without looping forever', () => {
    const r = findMatches('^', 'gm', 'a\nb\nc')
    expect(r.matches.map((m) => m.index)).toEqual([0, 2, 4])
    expect(findMatches('x*', 'g', 'ab').matches).toHaveLength(3)
  })

  it('is unicode aware with the u flag', () => {
    expect(findMatches('.', 'gu', '\u{1F600}a').matches.map((m) => m.text)).toEqual(['\u{1F600}', 'a'])
    expect(findMatches('.', 'g', '\u{1F600}').matches).toHaveLength(2)
  })

  it('caps the number of matches', () => {
    const r = findMatches('.', 'g', 'x'.repeat(50), 10)
    expect(r.matches).toHaveLength(10)
    expect(r.truncated).toBe(true)
  })

  it('respects the sticky flag', () => {
    expect(findMatches('a', 'gy', 'aab').matches).toHaveLength(2)
    expect(findMatches('b', 'gy', 'ab').matches).toHaveLength(0)
  })
})

describe('segmentText', () => {
  it('alternates plain and matched segments', () => {
    const text = 'cat hat bat'
    const segs = segmentText(text, findMatches('[ch]at', 'g', text).matches)
    expect(segs).toEqual([
      { text: 'cat', match: 0 },
      { text: ' ', match: null },
      { text: 'hat', match: 1 },
      { text: ' bat', match: null },
    ])
    expect(segs.map((s) => s.text).join('')).toBe(text)
  })

  it('keeps zero-length matches as empty segments', () => {
    const segs = segmentText('ab', findMatches('(?=b)', 'g', 'ab').matches)
    expect(segs).toEqual([
      { text: 'a', match: null },
      { text: '', match: 0 },
      { text: 'b', match: null },
    ])
  })

  it('returns the whole text when nothing matches', () => {
    expect(segmentText('abc', [])).toEqual([{ text: 'abc', match: null }])
  })
})

describe('replaceAll', () => {
  it('supports numbered and named back-references', () => {
    expect(replaceAll('(\\w+)@(\\w+)', 'g', 'a@b c@d', '$2 at $1')).toBe('b at a d at c')
    expect(replaceAll('(?<k>\\w+)=(?<v>\\w+)', '', 'x=1', '$<v>:$<k>')).toBe('1:x')
  })
})

describe('escapeRegex', () => {
  it('escapes every metacharacter so the literal matches itself', () => {
    const lit = 'a.b*c?(d)[e]{f}|g^h$i\\j/k-l+'
    expect(new RegExp(`^${escapeRegex(lit)}$`).test(lit)).toBe(true)
    expect(new RegExp(`^${escapeRegex(lit)}$`, 'u').test(lit)).toBe(true)
  })
})

describe('groupNames', () => {
  it('numbers named and unnamed groups in source order', () => {
    expect([...groupNames('(?<y>\\d+)-(\\d+)-(?<d>\\d+)')]).toEqual([
      [1, 'y'],
      [3, 'd'],
    ])
  })

  it('ignores escaped parens, classes, non-capturing groups and lookarounds', () => {
    expect([...groupNames('\\((?:a)(?=b)(?<!c)[(](?<x>e)')]).toEqual([[1, 'x']])
  })

  it('agrees with the engine on group count', () => {
    const pattern = '(a)(?:b)(?<n>c)[()](d)\\(e\\)'
    const engineCount = new RegExp(pattern).exec('abc(d(e)')!.length - 1
    expect(engineCount).toBe(3)
    expect([...groupNames(pattern)]).toEqual([[2, 'n']])
  })
})
